/**
 * QuillmarkHarness
 *
 * Drives Groq models through the live Quillmark MCP server at MCP_SERVER_URL.
 * Tool calls from the model are forwarded via an MCP Client over the real
 * Streamable HTTP transport — the full JSON-RPC protocol stack, real tool
 * schemas, and (for create_document) the real render pipeline.
 *
 * Token budget notes (6 000 TPM limit):
 *   - INTER_CALL_DELAY_MS enforces ≥20 s between every Groq API call
 *   - max_tokens 1 500 to prevent truncated tool-call generation
 *   - get_specs results are compacted for conversation history; full result
 *     is still used for pass/fail validation
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER_URL = process.env.MCP_SERVER_URL ?? 'https://tonguetoquill.app/mcp';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_TURNS = 8;
const INTER_CALL_DELAY_MS = 20_000; // ~3 calls/min → ≤4 500 TPM at 1 500 max_tokens

// Tracks the timestamp of the last outbound API call (module-level singleton)
let _lastCallAt = 0;

const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_quills',
      description: 'List available document formats (quills). Returns the quill names and descriptions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_specs',
      description:
        'Learn how to compose a document in a specific quill format. ' +
        'Returns an instruction and a blueprint (a commented YAML template showing every field). ' +
        'Always call this before create_document.',
      parameters: {
        type: 'object',
        properties: {
          quill: { type: 'string', description: 'Quill format name, e.g. "usaf_memo"' },
        },
        required: ['quill'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_document',
      description:
        'Create a document on the web editor. ' +
        'name is the document title shown to the user. ' +
        'content is the document body as quill-compliant markdown: start with a YAML block ' +
        '(between --- lines) containing QUILL and all required fields from the blueprint, ' +
        'then the body text after the closing ---. ' +
        'Returns {url, title} on success.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Document title' },
          content: { type: 'string', description: 'Quill-compliant markdown with YAML metadata block' },
        },
        required: ['name', 'content'],
      },
    },
  },
];

const SYSTEM_PROMPT =
  'You are a document authoring assistant with access to Quillmark tools. ' +
  'To create a document: call list_quills to find the right format, ' +
  'call get_specs with the quill name to get a blueprint showing every required field, ' +
  'then call create_document with a name (document title) and content (the filled-in blueprint). ' +
  'You must always call create_document to finish — do not stop after get_specs. ' +
  'If create_document returns an error, fix the content and call it again.';

export class QuillmarkHarness {
  constructor() {
    this.mcpClient = null;
    this._quillNames = [];
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;

    const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
    this.mcpClient = new Client({ name: 'quillmark-eval', version: '1.0.0' });
    await this.mcpClient.connect(transport);

    // Warm the quill name list for the report header.
    // The live server returns structuredContent: { quills: [{name, version, description}] }
    const raw = await this.mcpClient.callTool({ name: 'list_quills', arguments: {} });
    const parsed = _parseToolResult(raw);
    const quillArray = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.quills) ? parsed.quills
      : [];
    this._quillNames = quillArray.map((q) => q.name);

    this._initialized = true;
  }

  /** Quill format names — used by run.js for the report header. */
  quillNames() {
    return this._quillNames;
  }

  async _executeTool(name, args) {
    const raw = await this.mcpClient.callTool({ name, arguments: args ?? {} });
    return _parseToolResult(raw);
  }

  /**
   * Run one scenario against one model.
   * Returns a result record suitable for report generation, including token usage.
   */
  async runScenario(model, scenario, apiKey) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: scenario.prompt },
    ];

    const toolCallSequence = [];
    let lastToolResult = null;
    let turns = 0;
    let error = null;
    let finalResponse = null;
    let totalTokens = 0;

    try {
      while (turns < MAX_TURNS) {
        turns++;
        const response = await _callGroq(model, messages, TOOL_DEFS, apiKey);
        totalTokens += response.usage?.total_tokens ?? 0;

        const choice = response.choices[0];
        const message = choice.message;
        messages.push(message);

        if (message.tool_calls?.length) {
          for (const tc of message.tool_calls) {
            const toolName = tc.function.name;
            let toolArgs;
            try {
              toolArgs = JSON.parse(tc.function.arguments);
            } catch {
              toolArgs = {};
            }

            toolCallSequence.push(toolName);

            let toolResult;
            try {
              toolResult = await this._executeTool(toolName, toolArgs);
              lastToolResult = toolResult;
            } catch (e) {
              toolResult = { error: e.message };
            }

            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(toolResult),
            });
          }
        } else {
          finalResponse = message.content;
          break;
        }
      }
    } catch (e) {
      error = e.message;
    }

    const validation = scenario.validate(toolCallSequence, lastToolResult);

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      model,
      passed: error ? false : validation.passed,
      notes: error ? `Runtime error: ${error}` : validation.notes,
      toolCallSequence,
      turns,
      totalTokens,
      error,
      finalResponse: finalResponse ? finalResponse.slice(0, 300) : null,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract and JSON-parse the text content from an MCP tool call response.
 * The MCP SDK wraps tool results in { content: [{ type: 'text', text }] }.
 * structuredContent is preferred when present (avoids a JSON.parse round-trip).
 */
function _parseToolResult(raw) {
  if (raw?.structuredContent !== undefined) return raw.structuredContent;
  const text = raw?.content?.[0]?.text ?? '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}


async function _callGroq(model, messages, tools, apiKey, attempt = 0) {
  // Enforce minimum spacing between calls to stay under TPM limit
  if (attempt === 0) {
    const elapsed = Date.now() - _lastCallAt;
    if (_lastCallAt > 0 && elapsed < INTER_CALL_DELAY_MS) {
      await new Promise((r) => setTimeout(r, INTER_CALL_DELAY_MS - elapsed));
    }
    _lastCallAt = Date.now();
  }

  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 1500,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message ?? raw;
    } catch { /* leave as raw text */ }

    if (res.status === 429 && attempt < 3) {
      const delay = (attempt + 1) * INTER_CALL_DELAY_MS;
      await new Promise((r) => setTimeout(r, delay));
      return _callGroq(model, messages, tools, apiKey, attempt + 1);
    }

    throw new Error(`Groq ${res.status}: ${message}`);
  }

  return res.json();
}
