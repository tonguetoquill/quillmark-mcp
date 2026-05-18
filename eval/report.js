#!/usr/bin/env node
// Aggregates one or more JSONL result files: per-model summary table with timing,
// and a per-prompt × model success-rate grid. Prints to stdout.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

function parseCli() {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help || positionals.length === 0) {
    console.log('Usage: node eval/report.js [--json] <file.jsonl> [<file.jsonl>...]');
    process.exit(values.help ? 0 : 1);
  }
  return { files: positionals, json: values.json };
}

function loadJsonl(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Single source of truth for run outcomes, shared by run.js and the report.
// Every run lands in exactly one bucket, so success + infra + llm = 100%.
//   success — create_document succeeded
//   infra   — run died outside the model's control (provider / harness error)
//   llm     — model was reached but failed to complete the task
export function classifyOutcome(record) {
  if (record.success) return 'success';
  if (record.harnessError) return 'infra';
  if (record.terminationReason === 'provider_error') return 'infra';
  if (record.terminationReason === 'no_assistant_message') return 'infra';
  return 'llm';
}

export function summarize(records) {
  const byModel = new Map();
  for (const r of records) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model).push(r);
  }
  const out = [];
  for (const [model, runs] of byModel) {
    const total = runs.length;
    const successes = runs.filter((r) => r.success);
    const infra = runs.filter((r) => classifyOutcome(r) === 'infra').length;
    const llm = runs.filter((r) => classifyOutcome(r) === 'llm').length;
    const attemptCounts = successes.map((r) => r.createAttempts).sort((a, b) => a - b);
    const calledSpecs = runs.filter((r) => r.calledGetSpecsBeforeCreate === true).length;
    const sawCreate = runs.filter((r) => r.calledGetSpecsBeforeCreate !== null).length;
    const selfCorrected = successes.filter((r) => r.createAttempts > 1).length;
    const errorTally = new Map();
    for (const r of runs) {
      for (const cat of r.errorCategories ?? []) {
        errorTally.set(cat, (errorTally.get(cat) ?? 0) + 1);
      }
    }
    const termTally = new Map();
    for (const r of runs) {
      const t = r.terminationReason ?? 'unknown';
      termTally.set(t, (termTally.get(t) ?? 0) + 1);
    }
    out.push({
      model,
      total,
      successRate: successes.length / total,
      infraRate: infra / total,
      llmRate: llm / total,
      attemptsMean: attemptCounts.length ? attemptCounts.reduce((a, b) => a + b, 0) / attemptCounts.length : null,
      attemptsMedian: quantile(attemptCounts, 0.5),
      attemptsP90: quantile(attemptCounts, 0.9),
      attemptsMax: attemptCounts.at(-1) ?? null,
      specsBeforeCreateRate: sawCreate ? calledSpecs / sawCreate : null,
      selfCorrectionRate: successes.length ? selfCorrected / successes.length : null,
      meanToolCalls: runs.reduce((a, r) => a + (r.toolCallCount ?? 0), 0) / total,
      meanTokens: runs.reduce((a, r) => a + (r.totalTokens ?? 0), 0) / total,
      meanDurationMs: runs.reduce((a, r) => a + (r.durationMs ?? 0), 0) / total,
      errorCategories: Object.fromEntries([...errorTally.entries()].sort((a, b) => b[1] - a[1])),
      terminationReasons: Object.fromEntries([...termTally.entries()].sort((a, b) => b[1] - a[1])),
    });
  }
  return out;
}

export function summarizeByPrompt(records) {
  const prompts = [...new Set(records.map((r) => r.promptId))].sort();
  const models = [...new Set(records.map((r) => r.model))];
  const meta = {};
  for (const r of records) {
    if (!meta[r.promptId]) meta[r.promptId] = { quill: r.quill ?? null };
  }
  const grid = {};
  for (const promptId of prompts) {
    grid[promptId] = { meta: meta[promptId], byModel: {} };
    for (const model of models) {
      const runs = records.filter((r) => r.promptId === promptId && r.model === model);
      if (runs.length === 0) { grid[promptId].byModel[model] = null; continue; }
      const successes = runs.filter((r) => r.success);
      grid[promptId].byModel[model] = {
        successRate: successes.length / runs.length,
        meanDurationMs: runs.reduce((a, r) => a + (r.durationMs ?? 0), 0) / runs.length,
        n: runs.length,
      };
    }
  }
  return { prompts, models, grid };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const USE_COLOR = process.stdout.isTTY;
const C = USE_COLOR
  ? { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' }
  : { reset: '', bold: '', dim: '', green: '', yellow: '', red: '' };

function visLen(s) { return String(s).replace(/\x1b\[[0-9;]*m/g, '').length; }
function rpad(s, w) { s = String(s); return s + ' '.repeat(Math.max(0, w - visLen(s))); }
function lpad(s, w) { s = String(s); return ' '.repeat(Math.max(0, w - visLen(s))) + s; }

function colorPct(x, { invert = false } = {}) {
  if (x == null) return C.dim + '  -' + C.reset;
  const s = Math.round(x * 100) + '%';
  const good = invert ? x <= 0.2 : x >= 0.8;
  const ok = invert ? x <= 0.5 : x >= 0.5;
  if (good) return C.green + s + C.reset;
  if (ok) return C.yellow + s + C.reset;
  return C.red + s + C.reset;
}

function fmtDur(ms) {
  if (ms == null || ms === 0) return '-';
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms';
}

function fmtNum(x, dec = 2) { return x == null ? '-' : Number(x).toFixed(dec); }

function shortModel(name, max = 13) {
  const base = name.includes('/') ? name.split('/').slice(1).join('/') : name;
  return base.length > max ? base.slice(0, max - 1) + '…' : base;
}

function hline(widths, l, m, r) {
  return l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r;
}

function tableRow(cells, widths, pads) {
  return '│' + cells.map((c, i) => ' ' + (pads[i] ?? rpad)(String(c), widths[i]) + ' ').join('│') + '│';
}

export function printTable(rows) {
  const cols = [
    { h: 'model',     w: 34, p: rpad },
    { h: 'n',         w:  3, p: lpad },
    { h: 'success',   w:  7, p: lpad },
    { h: 'infra-err', w:  9, p: lpad },
    { h: 'llm-err',   w:  7, p: lpad },
    { h: 'mean-att',  w:  8, p: lpad },
    { h: 'med-att',   w:  7, p: lpad },
    { h: 'p90-att',   w:  7, p: lpad },
    { h: 'specs1st',  w:  8, p: lpad },
    { h: 'self-corr', w:  9, p: lpad },
    { h: 'tools',     w:  5, p: lpad },
    { h: 'mean-tok',  w:  8, p: lpad },
    { h: 'mean-time', w:  9, p: lpad },
  ];
  const W = cols.map((c) => c.w);
  const P = cols.map((c) => c.p);

  console.log('\n' + C.bold + 'Model Summary' + C.reset);
  console.log(hline(W, '┌', '┬', '┐'));
  console.log(tableRow(cols.map((c) => C.bold + c.h + C.reset), W, P));
  console.log(hline(W, '├', '┼', '┤'));
  for (const r of rows) {
    console.log(tableRow([
      r.model.slice(0, W[0]),
      r.total,
      colorPct(r.successRate),
      colorPct(r.infraRate, { invert: true }),
      colorPct(r.llmRate, { invert: true }),
      fmtNum(r.attemptsMean),
      fmtNum(r.attemptsMedian),
      fmtNum(r.attemptsP90),
      colorPct(r.specsBeforeCreateRate),
      colorPct(r.selfCorrectionRate),
      fmtNum(r.meanToolCalls),
      fmtNum(r.meanTokens, 0),
      fmtDur(r.meanDurationMs),
    ], W, P));
  }
  console.log(hline(W, '└', '┴', '┘'));

  console.log('');
  for (const r of rows) {
    console.log(C.bold + r.model + C.reset);
    if (Object.keys(r.errorCategories).length) {
      console.log('  ' + C.dim + 'errors:' + C.reset + '      ' + JSON.stringify(r.errorCategories));
    }
    console.log('  ' + C.dim + 'termination:' + C.reset + ' ' + JSON.stringify(r.terminationReasons));
  }
  console.log('');
}

function fmtPromptCell(cell) {
  if (!cell) return C.dim + '-' + C.reset;
  const pctStr = lpad(Math.round(cell.successRate * 100) + '%', 4);
  let colored;
  if (cell.successRate >= 0.8) colored = C.green + pctStr + C.reset;
  else if (cell.successRate >= 0.5) colored = C.yellow + pctStr + C.reset;
  else colored = C.red + pctStr + C.reset;
  return colored + C.dim + ' ' + fmtDur(cell.meanDurationMs) + C.reset;
}

export function printPromptTable({ prompts, models, grid }) {
  const MC = 13;
  const shortModels = models.map((m) => shortModel(m, MC));
  const W = [24, ...shortModels.map(() => MC)];
  const P = [rpad, ...models.map(() => rpad)];

  console.log(C.bold + 'Per-Prompt Results' + C.reset);
  console.log(hline(W, '┌', '┬', '┐'));
  console.log(tableRow(['prompt', ...shortModels].map((h) => C.bold + h + C.reset), W, P));
  console.log(hline(W, '├', '┼', '┤'));
  for (const promptId of prompts) {
    const { byModel } = grid[promptId];
    const cells = [
      promptId.slice(0, W[0]),
      ...models.map((m) => fmtPromptCell(byModel[m])),
    ];
    console.log(tableRow(cells, W, P));
  }
  console.log(hline(W, '└', '┴', '┘'));
  console.log('');
}

// Detect runs that died before reaching the model (provider/harness errors).
// When these dominate, the success grid below is meaningless config noise, so
// flag the cause once at the top instead of letting it read as "all 0%".
function preflightFailures(records) {
  const failed = records.filter((r) => classifyOutcome(r) === 'infra');
  if (failed.length === 0) return null;
  const missingKeys = new Set();
  for (const r of failed) {
    const texts = [r.harnessError, ...(r.errors ?? []).map((e) => e.message)];
    for (const text of texts) {
      const m = /env var (\w+) is unset/.exec(text ?? '');
      if (m) missingKeys.add(m[1]);
    }
  }
  return { total: records.length, failed: failed.length, missingKeys: [...missingKeys] };
}

export function printPreflightBanner(records) {
  const s = preflightFailures(records);
  if (!s || s.failed / s.total < 0.5) return;
  console.log('');
  console.log(C.red + C.bold + `⚠  ${s.failed}/${s.total} runs failed before reaching the model.` + C.reset);
  if (s.missingKeys.length) {
    console.log(C.red + `   Unset API key env var(s): ${s.missingKeys.join(', ')}` + C.reset);
    console.log(C.dim + '   Set these and re-run — the tables below reflect a misconfigured run.' + C.reset);
  } else {
    console.log(C.dim + '   Cause: provider/harness errors — check connectivity and config.' + C.reset);
  }
}

export function printReport(records) {
  printPreflightBanner(records);
  printTable(summarize(records));
  printPromptTable(summarizeByPrompt(records));
}

function main() {
  const { files, json } = parseCli();
  const records = files.flatMap(loadJsonl);
  if (json) {
    process.stdout.write(JSON.stringify({ byModel: summarize(records), byPrompt: summarizeByPrompt(records) }, null, 2) + '\n');
    return;
  }
  printReport(records);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
