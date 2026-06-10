/**
 * @module test/eval-modes
 * Validates the eval harness can drive each model "mode" the fleet uses:
 *   - native tool-calling (standard / reasoning / multimodal models)
 *   - prompted JSON tool-calling (Phi-4 family — no native function calling)
 *   - token-truncation accounting (reasoning models that run out of budget)
 * Drives runOne with a stub MCP + scripted responder, so no network, no API
 * tokens, and no subprocess are needed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runOne, parsePromptedToolCall, buildPromptedSystemPrompt } from '../eval/run.js';
import { classifyOutcome } from '../eval/report.js';

const LIMITS = { maxToolCalls: 12, maxCreateAttempts: 5 };
const PROMPT = { id: 'memo', quill: 'usaf_memo', prompt: 'Render a memo.' };

// Minimal tool schemas — prompted mode only needs names/descriptions for the
// system prompt; the stub MCP ignores arguments.
const TOOLS = [
  { type: 'function', function: { name: 'list_quills', description: 'list', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_spec', description: 'spec', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'create_document', description: 'create', parameters: { type: 'object', properties: {} } } },
];

// Stub MCP server: create_document succeeds with a URL, others echo ok.
const stubMcp = {
  async callTool({ name }) {
    if (name === 'create_document') {
      return { content: [{ type: 'text', text: 'rendered' }], structuredContent: { url: 'http://x/out.pdf' } };
    }
    return { content: [{ type: 'text', text: `${name} ok` }] };
  },
};

function nativeCall(id, name, args = {}) {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

describe('eval prompted-mode parsing', () => {
  it('parses a bare JSON object', () => {
    assert.deepEqual(parsePromptedToolCall('{"tool":"get_spec","arguments":{"quill":"x"}}'),
      { name: 'get_spec', arguments: { quill: 'x' } });
  });
  it('parses a fenced ```json block with surrounding prose', () => {
    const text = 'Sure, here is the call:\n```json\n{"tool":"list_quills","arguments":{}}\n```\n';
    assert.deepEqual(parsePromptedToolCall(text), { name: 'list_quills', arguments: {} });
  });
  it('tolerates trailing prose after the object', () => {
    assert.deepEqual(parsePromptedToolCall('{"tool":"list_quills"} — calling now'),
      { name: 'list_quills', arguments: {} });
  });
  it('returns null when the model answers in prose (declares done)', () => {
    assert.equal(parsePromptedToolCall('All done — the memo is rendered.'), null);
  });
  it('embeds every tool name in the prompted system prompt', () => {
    const sys = buildPromptedSystemPrompt(TOOLS);
    for (const t of TOOLS) assert.ok(sys.includes(t.function.name), `missing ${t.function.name}`);
    assert.ok(/"tool"/.test(sys), 'protocol example present');
  });
});

describe('eval mode wiring (runOne)', () => {
  it('drives a prompted (no-native-tools) model end-to-end', async () => {
    let step = 0;
    const mockResponder = async () => {
      step += 1;
      const content = step === 1 ? '{"tool":"list_quills","arguments":{}}'
        : step === 2 ? '```json\n{"tool":"get_spec","arguments":{"quill":"usaf_memo"}}\n```'
        : step === 3 ? '{"tool":"create_document","arguments":{"content":"---\\nQUILL: usaf_memo\\n---\\nbody"}}'
        : 'Done — the memo rendered successfully.';
      return { choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 1 } };
    };
    const rec = await runOne({
      model: { name: 'mock-phi', toolMode: 'prompted' },
      prompt: PROMPT, trial: 1, mcp: stubMcp, openaiTools: TOOLS, limits: LIMITS, mockResponder,
    });
    assert.equal(rec.success, true, 'prompted model should reach a successful create_document');
    assert.deepEqual(rec.toolSequence, ['list_quills', 'get_spec', 'create_document']);
    assert.equal(rec.calledGetSpecsBeforeCreate, true);
    assert.equal(rec.terminationReason, 'completed');
    assert.equal(rec.renderedUrl, 'http://x/out.pdf');
    assert.equal(classifyOutcome(rec), 'success');
  });

  it('drives a native tool-calling model end-to-end', async () => {
    let step = 0;
    const mockResponder = async () => {
      step += 1;
      if (step === 1) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [nativeCall('c1', 'get_spec', { quill: 'usaf_memo' })] } }], usage: {} };
      if (step === 2) return { choices: [{ message: { role: 'assistant', content: null, tool_calls: [nativeCall('c2', 'create_document', { content: 'x' })] } }], usage: {} };
      return { choices: [{ message: { role: 'assistant', content: 'done' } }], usage: {} };
    };
    const rec = await runOne({
      model: { name: 'mock-native' },
      prompt: PROMPT, trial: 1, mcp: stubMcp, openaiTools: TOOLS, limits: LIMITS, mockResponder,
    });
    assert.equal(rec.success, true);
    assert.deepEqual(rec.toolSequence, ['get_spec', 'create_document']);
    assert.equal(rec.terminationReason, 'completed');
  });

  it('classifies a reasoning model that exhausts its token budget as infra', async () => {
    const mockResponder = async () => ({
      choices: [{ message: { role: 'assistant', content: '', reasoning: 'thinking...' }, finish_reason: 'length' }],
      usage: { total_tokens: 8192 },
    });
    const rec = await runOne({
      model: { name: 'mock-reasoner', mode: 'reasoning' },
      prompt: PROMPT, trial: 1, mcp: stubMcp, openaiTools: TOOLS, limits: LIMITS, mockResponder,
    });
    assert.equal(rec.success, false);
    assert.equal(rec.terminationReason, 'output_truncated');
    assert.equal(classifyOutcome(rec), 'infra', 'budget truncation is infra, not a model failure');
  });
});
