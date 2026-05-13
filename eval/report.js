#!/usr/bin/env node
// Aggregates one or more JSONL result files into a per-model summary:
// success rate, attempts-to-success distribution, get_specs-before-create rate,
// self-correction rate, and error-category distribution. Prints a table to stdout.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

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

function summarize(records) {
  const byModel = new Map();
  for (const r of records) {
    if (!byModel.has(r.model)) byModel.set(r.model, []);
    byModel.get(r.model).push(r);
  }
  const out = [];
  for (const [model, runs] of byModel) {
    const total = runs.length;
    const successes = runs.filter((r) => r.success);
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

function fmtPct(x) { return x == null ? '   -' : (x * 100).toFixed(1).padStart(5) + '%'; }
function fmtNum(x, w = 5) { return x == null ? '-'.padStart(w) : (typeof x === 'number' ? x.toFixed(2) : String(x)).padStart(w); }

function printTable(rows) {
  const headers = ['model', 'n', 'success', 'mean-att', 'med-att', 'p90-att', 'specs1st', 'self-corr', 'mean-tools', 'mean-tok'];
  const widths = [38, 4, 7, 8, 7, 7, 8, 9, 10, 9];
  const fmt = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(' ');
  console.log(fmt(headers));
  console.log(fmt(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) {
    console.log(fmt([
      r.model.slice(0, widths[0]),
      r.total,
      fmtPct(r.successRate),
      fmtNum(r.attemptsMean),
      fmtNum(r.attemptsMedian),
      fmtNum(r.attemptsP90),
      fmtPct(r.specsBeforeCreateRate),
      fmtPct(r.selfCorrectionRate),
      fmtNum(r.meanToolCalls),
      fmtNum(r.meanTokens, 9),
    ]));
  }
  console.log('');
  for (const r of rows) {
    console.log(`# ${r.model}`);
    console.log('  errorCategories: ' + (Object.keys(r.errorCategories).length ? JSON.stringify(r.errorCategories) : '(none)'));
    console.log('  termination:     ' + JSON.stringify(r.terminationReasons));
  }
}

function main() {
  const { files, json } = parseCli();
  const records = files.flatMap(loadJsonl);
  const rows = summarize(records);
  if (json) {
    process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
    return;
  }
  printTable(rows);
}

main();
