#!/usr/bin/env node
// Drives an OpenAI-compatible tool-use loop against the local MCP server,
// records per-run telemetry as JSONL, and is model-agnostic (any
// OpenAI-compatible endpoint or the built-in --mock provider).

import { mkdir, appendFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  'You render documents using the available MCP tools (a system called Quillmark).',
  'The ONLY way to complete the task is to call create_document — never reply with the',
  'document as plain text. Writing the document in your message instead of calling the',
  'tool is a failure.',
  'Workflow: list_quills (if you need to discover formats) -> get_spec for the chosen quill -> create_document.',
  'Always call get_spec before create_document so you know the required fields and YAML shape.',
  'Pass the full document body as the `content` argument to create_document.',
  'If create_document returns an error, read the diagnostics and try again with corrected content.',
  'Stop after create_document succeeds.',
].join(' ');

function parseCli() {
  const { values } = parseArgs({
    options: {
      model: { type: 'string' },
      trials: { type: 'string', default: '3' },
      concurrency: { type: 'string', default: '2' },
      mock: { type: 'boolean', default: false },
      'preflight-only': { type: 'boolean', default: false },
      'list-models': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(`Usage: node eval/run.js --model <name> [--preflight-only] [--trials N] [--concurrency N]
       node eval/run.js --mock

  Runs ONE model (resolved from eval/config.json by --model) over every prompt.
  Fan-out across the fleet lives in the wrapper: eval/run-all.sh.

  --model <name>   Config model to run (exact \`name\`). Required unless --mock.
  --mock           Skip config; run one built-in happy-path responder
  --preflight-only Probe the model's reachability/crib, then exit (cheap; no
                   prompts, no tool loops) — validates slug/key/mode
  --trials N       Trials per prompt [default: 3]
  --concurrency N  Max concurrent in-flight requests to the model [default: 2]
  --list-models    Print every config model name (one per line) and exit;
                   the source of truth run-all.sh sweeps over

Reads:  eval/config.json (or eval/config.example.json if absent)
        eval/prompts.json
Writes: eval/results/<timestamp>__<model>.jsonl

Aggregate across runs: node eval/report.js eval/results/*.jsonl`);
    process.exit(0);
  }
  return {
    model: values.model,
    trials: parseInt(values.trials, 10),
    concurrency: Math.max(1, parseInt(values.concurrency, 10)),
    mock: values.mock,
    preflightOnly: values['preflight-only'],
    listModels: values['list-models'],
    ts: new Date().toISOString().replace(/[:.]/g, '-'),
  };
}

// Turn a model name (which may contain slashes) into a safe filename fragment.
const fileSlug = (s) => s.replace(/[^a-zA-Z0-9._-]/g, '-');

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

// A model is in "reasoning mode" if its config says so or it ships a `reasoning`
// extraBody. Reasoning models spend hidden tokens before producing visible
// output, so they need a bigger budget and looser preflight handling than a
// plain instruct model.
const isReasoning = (model) => model.mode === 'reasoning' || Boolean(model.extraBody?.reasoning);

// The prescribed tool chain is: list_quills? -> get_spec -> create_document
// (list_quills is optional discovery; the other two are required). A run
// "follows the chain" when, restricted to these prescribed steps, the first
// call to each ascends in this canonical order AND the required steps are
// present. Returns null when the model never reached create_document — there's
// no chain to judge — mirroring calledGetSpecsBeforeCreate so both metrics
// share the same denominator (runs that actually attempted a create).
const CHAIN_ORDER = ['list_quills', 'get_spec', 'create_document'];
export function toolChainOrdered(toolSequence) {
  if (!toolSequence.includes('create_document')) return null;
  // First-occurrence index of each prescribed step the model actually used,
  // kept in canonical order.
  const seen = CHAIN_ORDER
    .map((name) => [name, toolSequence.indexOf(name)])
    .filter(([, i]) => i >= 0);
  // get_spec is required (create_document presence is already guaranteed above).
  if (!seen.some(([name]) => name === 'get_spec')) return false;
  // First calls must ascend: any prescribed step called out of canonical order
  // (e.g. create before spec, or spec before list_quills) breaks the chain.
  for (let k = 1; k < seen.length; k += 1) {
    if (seen[k][1] < seen[k - 1][1]) return false;
  }
  return true;
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
    body: JSON.stringify({ ...model.extraBody, ...body }),
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

export async function runOne({ model, prompt, trial, mcp, openaiTools, limits, mockResponder }) {
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
    // Preserve reasoning traces: some providers reject a follow-up turn that
    // drops the assistant's `reasoning`/`reasoning_content` after a tool call.
    // Harmless for non-reasoning models.
    const assistantEntry = {
      role: 'assistant',
      content: assistantMsg.content ?? null,
      tool_calls: assistantMsg.tool_calls,
    };
    if (assistantMsg.reasoning != null) assistantEntry.reasoning = assistantMsg.reasoning;
    if (assistantMsg.reasoning_content != null) assistantEntry.reasoning_content = assistantMsg.reasoning_content;
    messages.push(assistantEntry);

    const calls = (assistantMsg.tool_calls ?? []).map((c) => {
      let args = {};
      try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = { __parseError: c.function?.arguments }; }
      return { id: c.id, name: c.function?.name, args };
    });

    if (calls.length === 0) {
      // A reasoning/long model that hit the token cap before emitting a call is
      // a budget problem (infra), not the model declining the task.
      if (!success && choice?.finish_reason === 'length') terminationReason = 'output_truncated';
      else terminationReason = success ? 'completed' : 'model_stopped_without_success';
      break;
    }
    for (const call of calls) {
      toolCallCount += 1;
      const name = call.name;
      const args = call.args ?? {};
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
    toolChainOrdered: toolChainOrdered(toolSequence),
    errors,
    errorCategories: [...new Set(errors.map((e) => e.category).filter(Boolean))],
    renderedUrl,
    totalTokens,
    durationMs: Date.now() - t0,
    terminationReason,
    timestamp: new Date().toISOString(),
  };
}


const PREFLIGHT_CRIB = 'hello world';
const PREFLIGHT_TIMEOUT_MS = 30000;

// Probe the model with a trivial known-answer ("crib") query before the run.
// This verifies the provider is actually reachable and the key is valid — not
// just that the env var is set — so a misconfigured provider surfaces as one
// clear line instead of N identical provider_error records. Returns true if the
// model is healthy; the caller aborts the run when it isn't.
async function preflightProbe(model) {
  if (model.mock) return true;
  console.error(`[eval] preflight: probing ${model.name} with a crib query...`);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PREFLIGHT_TIMEOUT_MS);
  const reasoning = isReasoning(model);
  // Reasoning models spend the budget on hidden thinking; a 64-token cap leaves
  // no room to echo the crib. Give them headroom (configurable per model).
  const cribBudget = model.preflightMaxTokens ?? (reasoning ? 1024 : 64);
  try {
    const resp = await callOpenAICompat(model, {
      model: model.name,
      messages: [{ role: 'user', content: `Reply with exactly this and nothing else: ${PREFLIGHT_CRIB}` }],
      ...temperatureField(model),
      ...maxTokensField(model, cribBudget),
    }, ac.signal);
    const msg = resp.choices?.[0]?.message;
    const out = msg?.content ?? '';
    const echoed = out.toLowerCase().includes(PREFLIGHT_CRIB);
    // A reasoning model may bury or truncate the literal echo even though the
    // provider is healthy — a parsed 200 already proves reachability + auth.
    const ok = echoed || (reasoning && Boolean(msg));
    const detail = echoed ? '' : (ok ? 'reachable; crib not echoed (reasoning model)' : `crib not echoed (got: ${JSON.stringify(out.slice(0, 80))})`);
    console.error(`[eval] ${ok ? 'ok  ' : 'FAIL'} ${model.name}${detail ? ' — ' + detail : ''}`);
    return ok;
  } catch (err) {
    console.error(`[eval] FAIL ${model.name} — ${err.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseCli();

  // Single source of truth for "what models exist" — run-all.sh sweeps this.
  if (args.listModels) {
    for (const m of loadJson(CONFIG_PATH).models ?? []) console.log(m.name);
    return;
  }

  const prompts = loadJson(PROMPTS_PATH);
  if (prompts.length === 0) throw new Error(`No prompts in ${PROMPTS_PATH}`);

  let model;
  if (args.mock) {
    model = { name: 'mock://happy-path', mock: true };
  } else {
    if (!args.model) {
      throw new Error('Missing --model <name>. Run --help, or use eval/run-all.sh to sweep the fleet.');
    }
    const all = loadJson(CONFIG_PATH).models ?? [];
    model = all.find((m) => m.name === args.model);
    if (!model) {
      throw new Error(`Model not found: ${args.model}\nAvailable: ${all.map((m) => m.name).join(', ')}`);
    }
  }

  const out = path.join(HERE, 'results', `${args.ts}__${fileSlug(args.mock ? 'mock' : model.name)}.jsonl`);
  await mkdir(path.dirname(out), { recursive: true });

  if (!(await preflightProbe(model))) {
    throw new Error(`preflight failed for ${model.name}`);
  }
  if (args.preflightOnly) {
    console.error(`[eval] preflight-only: ${model.name} healthy. Exiting before any prompts run.`);
    return;
  }

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
      tasks.push({ prompt, trial });
    }
  }
  const total = tasks.length;
  const records = [];

  console.error(`[eval] model=${model.name} prompts=${prompts.length} trials=${args.trials} concurrency=${args.concurrency} out=${out}`);

  // Single model => a fixed pool of `concurrency` workers drains a shared task
  // iterator, capping in-flight requests to this one provider. Fan-out across
  // models is the wrapper's job (run-all.sh).
  let started = 0;
  const queue = tasks[Symbol.iterator]();
  const worker = async () => {
    for (const task of queue) {
      const idx = ++started;
      let record;
      try {
        record = await runOne({ model, prompt: task.prompt, trial: task.trial, mcp, openaiTools, limits, mockResponder: model.mock ? makeMockResponder(task.prompt.quill) : null });
      } catch (err) {
        record = {
          model: model.name,
          promptId: task.prompt.id,
          trial: task.trial,
          success: false,
          harnessError: err.message,
          timestamp: new Date().toISOString(),
        };
      }
      const label = `[${idx}/${total}] ${model.name} :: ${task.prompt.id} trial=${task.trial}`;
      if (record.harnessError) console.error(`${label} -> ${classifyOutcome(record)} harnessError: ${record.harnessError}`);
      else console.error(`${label} -> ${classifyOutcome(record)} attempts=${record.createAttempts} tools=${record.toolCallCount} reason=${record.terminationReason}`);
      records.push(record);
      await appendFile(out, JSON.stringify(record) + '\n');
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));

  await mcp.close();
  console.error(`[eval] done. wrote ${out}\n`);
  printReport(records);
}

// Only run the eval when invoked directly (`node eval/run.js`); stay quiet when
// imported (tests pull in runOne directly).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[eval] fatal:', err);
    process.exit(1);
  });
}
