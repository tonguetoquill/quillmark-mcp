#!/usr/bin/env node
// Drives an OpenAI-compatible tool-use loop against the local MCP server,
// records per-run telemetry as JSONL, and is model-agnostic (any
// OpenAI-compatible endpoint or the built-in --mock provider).

import { spawn } from 'node:child_process';
import { mkdir, appendFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const SYSTEM_PROMPT = [
  'You help a user generate a document using the available MCP tools.',
  'Workflow: list_quills (if you need to discover formats) -> get_specs for the chosen quill -> create_document.',
  'Always call get_specs before create_document so you know the required fields and YAML shape.',
  'Pass the full document body as the `content` argument to create_document.',
  'If create_document returns an error, read the diagnostics and try again with corrected content.',
  'Stop after create_document succeeds.',
].join(' ');

function parseCli() {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', default: path.join(HERE, 'config.example.json') },
      prompts: { type: 'string', default: path.join(HERE, 'prompts.json') },
      out: { type: 'string' },
      trials: { type: 'string', default: '3' },
      'max-tool-calls': { type: 'string', default: '12' },
      'max-create-attempts': { type: 'string', default: '5' },
      'filter-model': { type: 'string' },
      'filter-prompt': { type: 'string' },
      mock: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(`Usage: node eval/run.js [options]

  --config <path>             Model config JSON (default: eval/config.example.json)
  --prompts <path>            Prompt fixtures JSON (default: eval/prompts.json)
  --out <path>                JSONL output (default: eval/results/<ts>.jsonl)
  --trials <n>                Trials per (model, prompt) (default: 3)
  --max-tool-calls <n>        Hard cap on tool calls per run (default: 12)
  --max-create-attempts <n>   Cap on create_document attempts per run (default: 5)
  --filter-model <name>       Run only this model
  --filter-prompt <id>        Run only this prompt id
  --mock                      Ignore config; run one built-in happy-path mock model

Env: API keys for each provider come from the env var named in config.apiKeyEnv.`);
    process.exit(0);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  values.out ??= path.join(HERE, 'results', `${ts}.jsonl`);
  values.trials = parseInt(values.trials, 10);
  values['max-tool-calls'] = parseInt(values['max-tool-calls'], 10);
  values['max-create-attempts'] = parseInt(values['max-create-attempts'], 10);
  return values;
}

function loadJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function mcpToolsToOpenAI(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.inputSchema && Object.keys(t.inputSchema).length > 0
        ? t.inputSchema
        : { type: 'object', properties: {} },
    },
  }));
}

function toolResultText(result) {
  if (!result || !Array.isArray(result.content)) return '';
  return result.content
    .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n');
}

function categorizeError(errorText) {
  if (!errorText) return 'unknown';
  const t = errorText.toLowerCase();
  if (t.includes('quill:') && t.includes('required')) return 'missing_quill_field';
  if (t.includes('document parse failed') || t.includes('parse::')) return 'yaml_parse';
  if (t.includes('unable to resolve quill format reference')) return 'unknown_quill';
  if (t.includes('missing required field')) return 'schema_missing_field';
  if (t.includes('field `content`') || t.includes('field `quill`')) return 'tool_input_schema';
  if (t.includes('document rendering failed')) return 'render_failure';
  if (t.includes('template') || t.includes('typst')) return 'template_failure';
  return 'other';
}

async function callOpenAICompat(model, body, signal) {
  const headers = { 'Content-Type': 'application/json' };
  const apiKey = model.apiKeyEnv ? process.env[model.apiKeyEnv] : undefined;
  if (!apiKey && model.apiKeyEnv) {
    throw new Error(`Missing API key: env var ${model.apiKeyEnv} is unset`);
  }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  for (const [k, v] of Object.entries(model.extraHeaders ?? {})) headers[k] = v;
  const url = `${model.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

// Minimal happy-path "mock" model: list_quills -> get_specs -> create_document
// using each quill's shipped example.md. Lets us verify the harness wiring
// end-to-end without any API keys.
function makeMockResponder(promptQuill) {
  let step = 0;
  let chosenQuill = promptQuill;
  return async function mockChat({ messages }) {
    step += 1;
    if (step === 1) {
      return {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'c1',
              type: 'function',
              function: { name: 'list_quills', arguments: '{}' },
            }],
          },
        }],
        usage: { total_tokens: 0 },
      };
    }
    if (step === 2) {
      const listMsg = messages.findLast((m) => m.role === 'tool');
      if (!chosenQuill && listMsg) {
        const first = listMsg.content.split('\n')[0]?.split('@')[0]?.split(':')[0]?.trim();
        chosenQuill = first;
      }
      return {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'c2',
              type: 'function',
              function: { name: 'get_specs', arguments: JSON.stringify({ quill: chosenQuill }) },
            }],
          },
        }],
        usage: { total_tokens: 0 },
      };
    }
    if (step === 3) {
      const exampleDir = path.join(REPO, 'quiver', 'quills', chosenQuill);
      let example = '';
      try {
        const fs = await import('node:fs/promises');
        const subdirs = await fs.readdir(exampleDir);
        const version = subdirs.find((d) => /^\d/.test(d)) ?? subdirs[0];
        example = await fs.readFile(path.join(exampleDir, version, 'example.md'), 'utf8');
      } catch {
        example = `---\nQUILL: ${chosenQuill}\n---\n# Mock body\n`;
      }
      return {
        choices: [{
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'c3',
              type: 'function',
              function: { name: 'create_document', arguments: JSON.stringify({ content: example }) },
            }],
          },
        }],
        usage: { total_tokens: 0 },
      };
    }
    return {
      choices: [{ message: { role: 'assistant', content: 'done', tool_calls: undefined } }],
      usage: { total_tokens: 0 },
    };
  };
}

async function runOne({ model, prompt, trial, mcp, openaiTools, limits, mockResponder }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt.prompt },
  ];
  const toolSequence = [];
  const errors = [];
  let createAttempts = 0;
  let success = false;
  let renderedUrl = null;
  let totalTokens = 0;
  let toolCallCount = 0;
  const t0 = Date.now();
  let terminationReason = null;

  while (toolCallCount < limits.maxToolCalls && createAttempts < limits.maxCreateAttempts) {
    const body = {
      model: model.name,
      messages,
      tools: openaiTools,
      tool_choice: 'auto',
      temperature: model.temperature ?? 0,
      max_tokens: model.maxTokens ?? 2048,
    };
    let resp;
    try {
      resp = mockResponder
        ? await mockResponder({ messages })
        : await callOpenAICompat(model, body);
    } catch (err) {
      terminationReason = 'provider_error';
      errors.push({ stage: 'provider', message: err.message });
      break;
    }
    if (resp.usage?.total_tokens) totalTokens += resp.usage.total_tokens;
    const choice = resp.choices?.[0];
    const assistantMsg = choice?.message;
    if (!assistantMsg) {
      terminationReason = 'no_assistant_message';
      break;
    }
    messages.push({
      role: 'assistant',
      content: assistantMsg.content ?? null,
      tool_calls: assistantMsg.tool_calls,
    });
    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      terminationReason = success ? 'completed' : 'model_stopped_without_success';
      break;
    }
    for (const call of toolCalls) {
      toolCallCount += 1;
      const name = call.function?.name;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = { __parseError: call.function?.arguments }; }
      toolSequence.push(name);
      if (name === 'create_document') createAttempts += 1;
      let result;
      try {
        result = await mcp.callTool({ name, arguments: args });
      } catch (err) {
        result = { isError: true, content: [{ type: 'text', text: `Transport error: ${err.message}` }] };
      }
      const text = toolResultText(result);
      const isErr = Boolean(result.isError);
      if (isErr) {
        errors.push({
          attempt: toolCallCount,
          tool: name,
          category: categorizeError(text),
          message: text.split('\n')[0]?.slice(0, 300) ?? '',
        });
      }
      if (name === 'create_document' && !isErr) {
        success = true;
        try {
          const sc = result.structuredContent;
          if (sc?.url) renderedUrl = sc.url;
        } catch { /* ignore */ }
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: text || (isErr ? 'error' : 'ok'),
      });
      if (success) break;
    }
    if (success) { terminationReason = 'completed'; break; }
  }
  if (!terminationReason) {
    terminationReason = createAttempts >= limits.maxCreateAttempts ? 'max_create_attempts' : 'max_tool_calls';
  }

  const calledGetSpecsBeforeCreate = (() => {
    const i = toolSequence.indexOf('create_document');
    if (i < 0) return null;
    return toolSequence.slice(0, i).includes('get_specs');
  })();

  return {
    model: model.name,
    promptId: prompt.id,
    quill: prompt.quill ?? null,
    difficulty: prompt.difficulty ?? null,
    trial,
    success,
    createAttempts,
    toolCallCount,
    toolSequence,
    calledGetSpecsBeforeCreate,
    errors,
    errorCategories: [...new Set(errors.map((e) => e.category).filter(Boolean))],
    renderedUrl,
    totalTokens,
    durationMs: Date.now() - t0,
    terminationReason,
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  const args = parseCli();
  await mkdir(path.dirname(args.out), { recursive: true });

  const promptFixtures = loadJson(args.prompts);
  const prompts = args['filter-prompt']
    ? promptFixtures.filter((p) => p.id === args['filter-prompt'])
    : promptFixtures;
  if (prompts.length === 0) throw new Error('No prompts to run after filtering.');

  let models;
  if (args.mock) {
    models = [{ name: 'mock://happy-path', mock: true }];
  } else {
    const config = loadJson(args.config);
    models = config.models ?? [];
    if (args['filter-model']) models = models.filter((m) => m.name === args['filter-model']);
    if (models.length === 0) throw new Error('No models to run after filtering.');
  }

  // Spawn the MCP server over stdio.
  const serverCmd = process.execPath;
  const serverArgs = [path.join(REPO, 'src', 'bin.js'), '--stdio'];
  const transport = new StdioClientTransport({ command: serverCmd, args: serverArgs });
  const mcp = new Client({ name: 'quillmark-eval', version: '0.1.0' });
  await mcp.connect(transport);

  const { tools } = await mcp.listTools();
  const openaiTools = mcpToolsToOpenAI(tools);

  const limits = {
    maxToolCalls: args['max-tool-calls'],
    maxCreateAttempts: args['max-create-attempts'],
  };

  console.error(`[eval] models=${models.length} prompts=${prompts.length} trials=${args.trials} out=${args.out}`);

  let runIdx = 0;
  const total = models.length * prompts.length * args.trials;
  for (const model of models) {
    for (const prompt of prompts) {
      for (let trial = 1; trial <= args.trials; trial += 1) {
        runIdx += 1;
        const mockResponder = model.mock ? makeMockResponder(prompt.quill) : null;
        const label = `[${runIdx}/${total}] ${model.name} :: ${prompt.id} trial=${trial}`;
        try {
          const record = await runOne({ model, prompt, trial, mcp, openaiTools, limits, mockResponder });
          await appendFile(args.out, JSON.stringify(record) + '\n');
          console.error(`${label} -> success=${record.success} attempts=${record.createAttempts} tools=${record.toolCallCount} reason=${record.terminationReason}`);
        } catch (err) {
          const record = {
            model: model.name,
            promptId: prompt.id,
            trial,
            success: false,
            harnessError: err.message,
            timestamp: new Date().toISOString(),
          };
          await appendFile(args.out, JSON.stringify(record) + '\n');
          console.error(`${label} -> harnessError: ${err.message}`);
        }
      }
    }
  }

  await mcp.close();
  console.error(`[eval] done. wrote ${args.out}`);
}

main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(1);
});
