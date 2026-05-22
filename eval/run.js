#!/usr/bin/env node
// Drives an OpenAI-compatible tool-use loop against the local MCP server,
// records per-run telemetry as JSONL, and is model-agnostic (any
// OpenAI-compatible endpoint or the built-in --mock provider).

import { mkdir, appendFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { printReport, classifyOutcome } from './report.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const CONFIG_PATH = existsSync(path.join(HERE, 'config.json'))
  ? path.join(HERE, 'config.json')
  : path.join(HERE, 'config.example.json');
const PROMPTS_PATH = path.join(HERE, 'prompts.json');
const MAX_TOOL_CALLS = 12;
const MAX_CREATE_ATTEMPTS = 5;

const SYSTEM_PROMPT = [
  'You help a user generate a document using the available MCP tools.',
  'Workflow: list_quills (if you need to discover formats) -> get_spec for the chosen quill -> create_document.',
  'Always call get_spec before create_document so you know the required fields and YAML shape.',
  'Pass the full document body as the `content` argument to create_document.',
  'If create_document returns an error, read the diagnostics and try again with corrected content.',
  'Stop after create_document succeeds.',
].join(' ');

function parseCli() {
  const { values } = parseArgs({
    options: {
      trials: { type: 'string', default: '3' },
      concurrency: { type: 'string', default: '2' },
      mock: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(`Usage: node eval/run.js [--mock] [--trials N] [--concurrency N]

  --mock           Skip config; run one built-in happy-path responder
  --trials N       Trials per (model, prompt) [default: 3]
  --concurrency N  Max concurrent calls per provider (base URL) [default: 2]

Reads:  eval/config.json (or eval/config.example.json if absent)
        eval/prompts.json
Writes: eval/results/<timestamp>.jsonl`);
    process.exit(0);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    trials: parseInt(values.trials, 10),
    concurrency: Math.max(1, parseInt(values.concurrency, 10)),
    mock: values.mock,
    out: path.join(HERE, 'results', `${ts}.jsonl`),
  };
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

// GPT-5 / o-series models reject `max_tokens` and require `max_completion_tokens`.
// Config can override the field name per model via `maxTokensParam`.
function maxTokensField(model, value) {
  return { [model.maxTokensParam ?? 'max_tokens']: value };
}

// GPT-5 / o-series models reject any temperature other than the default, so
// omit the field entirely when a model's config leaves `temperature` unset.
function temperatureField(model) {
  return model.temperature === undefined ? {} : { temperature: model.temperature };
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

// Minimal happy-path "mock" model: list_quills -> get_spec -> create_document
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
              function: { name: 'get_spec', arguments: JSON.stringify({ quill: chosenQuill }) },
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
      ...temperatureField(model),
      ...maxTokensField(model, model.maxTokens ?? 2048),
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
    return toolSequence.slice(0, i).includes('get_spec');
  })();

  return {
    model: model.name,
    promptId: prompt.id,
    quill: prompt.quill ?? null,
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

// Bounds concurrency: at most `max` holders at once. release() hands the
// permit straight to the next waiter, so the live count never exceeds `max`.
class Semaphore {
  constructor(max) {
    this.max = max;
    this.held = 0;
    this.waiters = [];
  }
  async acquire() {
    if (this.held < this.max) { this.held += 1; return; }
    await new Promise((resolve) => this.waiters.push(resolve));
  }
  release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.held -= 1;
  }
}

const providerKey = (model) => (model.mock ? 'mock' : model.baseUrl);

// One Semaphore per provider (keyed by base URL) capping concurrent calls.
function providerSemaphores(models, perProvider) {
  const sems = new Map();
  for (const m of models) {
    const key = providerKey(m);
    if (!sems.has(key)) sems.set(key, new Semaphore(perProvider));
  }
  return sems;
}

const PREFLIGHT_CRIB = 'hello world';
const PREFLIGHT_TIMEOUT_MS = 30000;

// Probe each model with a trivial known-answer ("crib") query before the run.
// This verifies the provider is actually reachable and the key is valid — not
// just that the env var is set — so a misconfigured provider surfaces as one
// clear line instead of N identical provider_error records. Warn, never abort.
async function preflightProbe(models, perProvider) {
  const targets = models.filter((m) => !m.mock);
  if (targets.length === 0) return;
  console.error(`[eval] preflight: probing ${targets.length} model(s) with a crib query...`);

  const sems = providerSemaphores(targets, perProvider);
  const results = [];
  await Promise.all(targets.map(async (model) => {
    const sem = sems.get(providerKey(model));
    await sem.acquire();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PREFLIGHT_TIMEOUT_MS);
    try {
      const resp = await callOpenAICompat(model, {
        model: model.name,
        messages: [{ role: 'user', content: `Reply with exactly this and nothing else: ${PREFLIGHT_CRIB}` }],
        ...temperatureField(model),
        ...maxTokensField(model, 64),
      }, ac.signal);
      const out = resp.choices?.[0]?.message?.content ?? '';
      const ok = out.toLowerCase().includes(PREFLIGHT_CRIB);
      results.push({
        model: model.name,
        ok,
        detail: ok ? '' : `crib not echoed (got: ${JSON.stringify(out.slice(0, 80))})`,
      });
    } catch (err) {
      results.push({ model: model.name, ok: false, detail: err.message });
    } finally {
      clearTimeout(timer);
      sem.release();
    }
  }));

  for (const r of results) {
    console.error(`[eval] ${r.ok ? 'ok  ' : 'FAIL'} ${r.model}${r.detail ? ' — ' + r.detail : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.error(`[eval] WARNING: ${failed}/${targets.length} model(s) failed preflight; their runs will likely fail.`);
  }
}

async function main() {
  const args = parseCli();
  await mkdir(path.dirname(args.out), { recursive: true });

  const prompts = loadJson(PROMPTS_PATH);
  if (prompts.length === 0) throw new Error(`No prompts in ${PROMPTS_PATH}`);

  const models = args.mock
    ? [{ name: 'mock://happy-path', mock: true }]
    : (loadJson(CONFIG_PATH).models ?? []);
  if (models.length === 0) throw new Error(`No models in ${CONFIG_PATH}`);

  if (!args.mock) await preflightProbe(models, args.concurrency);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(REPO, 'src', 'bin.js'), '--stdio'],
  });
  const mcp = new Client({ name: 'quillmark-eval', version: '0.1.0' });
  await mcp.connect(transport);

  const { tools } = await mcp.listTools();
  const openaiTools = mcpToolsToOpenAI(tools);
  const limits = { maxToolCalls: MAX_TOOL_CALLS, maxCreateAttempts: MAX_CREATE_ATTEMPTS };

  const tasks = [];
  for (let trial = 1; trial <= args.trials; trial += 1) {
    for (const prompt of prompts) {
      for (const model of models) {
        tasks.push({ model, prompt, trial });
      }
    }
  }
  const total = tasks.length;
  const records = [];
  let done = 0;

  // One worker per model => at most 1 run per model in flight. Each run also
  // acquires its provider's semaphore => at most --concurrency per provider.
  const sems = providerSemaphores(models, args.concurrency);
  const byModel = new Map();
  for (const task of tasks) {
    if (!byModel.has(task.model.name)) byModel.set(task.model.name, []);
    byModel.get(task.model.name).push(task);
  }

  console.error(`[eval] models=${models.length} prompts=${prompts.length} trials=${args.trials} providers=${sems.size} perProvider=${args.concurrency} out=${args.out}`);

  await Promise.all([...byModel.values()].map(async (queue) => {
    const sem = sems.get(providerKey(queue[0].model));
    for (const task of queue) {
      await sem.acquire();
      const idx = ++done;
      const mockResponder = task.model.mock ? makeMockResponder(task.prompt.quill) : null;
      const label = `[${idx}/${total}] ${task.model.name} :: ${task.prompt.id} trial=${task.trial}`;
      let record;
      try {
        record = await runOne({ model: task.model, prompt: task.prompt, trial: task.trial, mcp, openaiTools, limits, mockResponder });
        console.error(`${label} -> ${classifyOutcome(record)} attempts=${record.createAttempts} tools=${record.toolCallCount} reason=${record.terminationReason}`);
      } catch (err) {
        record = {
          model: task.model.name,
          promptId: task.prompt.id,
          trial: task.trial,
          success: false,
          harnessError: err.message,
          timestamp: new Date().toISOString(),
        };
        console.error(`${label} -> ${classifyOutcome(record)} harnessError: ${err.message}`);
      } finally {
        sem.release();
      }
      records.push(record);
      await appendFile(args.out, JSON.stringify(record) + '\n');
    }
  }));

  await mcp.close();
  console.error(`[eval] done. wrote ${args.out}\n`);
  printReport(records);
}

main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(1);
});
