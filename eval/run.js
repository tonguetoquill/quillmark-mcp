#!/usr/bin/env node
/**
 * Quillmark MCP multi-model eval runner.
 *
 * Usage:
 *   GROQ_API_KEY=<key> node eval/run.js [--models model1,model2,model3]
 *
 * Models can also be set via GROQ_MODELS env var (comma-separated).
 * Up to 3 models are evaluated; extras are ignored.
 *
 * Defaults (if no --models or GROQ_MODELS):
 *   llama-3.1-8b-instant, gemma2-9b-it, llama-3.3-70b-versatile
 *
 * The report is written to eval/report.md and also printed to stdout.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { QuillmarkHarness } from './harness.js';
import { SCENARIOS } from './scenarios.js';
import { generateReport } from './report.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODELS = [
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
];

function parseModels() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--models' && args[i + 1]) {
      return args[i + 1].split(',').map((m) => m.trim()).filter(Boolean);
    }
  }
  if (process.env.GROQ_MODELS) {
    return process.env.GROQ_MODELS.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return [...DEFAULT_MODELS];
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('Error: GROQ_API_KEY environment variable is required.');
    process.exit(1);
  }

  const models = parseModels().slice(0, 3);
  const totalScenarios = models.length * SCENARIOS.length;
  // Each scenario averages ~2.5 turns; 12 s spacing between calls
  const estMinutes = Math.ceil((totalScenarios * 2.5 * 12) / 60);

  const serverUrl = process.env.MCP_SERVER_URL ?? 'https://tonguetoquill.app/mcp';
  console.log(`\nQuillmark MCP — Multi-Model Eval`);
  console.log(`Server:  ${serverUrl}`);
  console.log(`Models (${models.length}): ${models.join(', ')}`);
  console.log(`Scenarios: ${SCENARIOS.length}  |  Est. runtime: ~${estMinutes} min (20 s inter-call delay, 6 000 TPM budget)\n`);

  const harness = new QuillmarkHarness();
  await harness.init();

  const quillFormats = harness.quillNames();
  console.log(`Quill formats loaded: ${quillFormats.join(', ')}\n`);

  const results = [];
  let cumulativeTokens = 0;

  for (const model of models) {
    console.log(`── ${model}`);
    for (const scenario of SCENARIOS) {
      process.stdout.write(`   [${scenario.id.padEnd(14)}] `);
      const result = await harness.runScenario(model, scenario, apiKey);
      results.push(result);
      cumulativeTokens += result.totalTokens ?? 0;
      const label = result.error ? '⚠️  error' : result.passed ? '✅ pass ' : '❌ fail ';
      const seq = result.toolCallSequence.join(' → ') || 'no tools called';
      const tok = result.totalTokens ? `  [${result.totalTokens} tok]` : '';
      console.log(`${label}  (${result.turns} turn${result.turns !== 1 ? 's' : ''})${tok}  ${seq}`);
      if (result.error) console.log(`           ↳ ${result.notes}`);
    }
    console.log('');
  }

  console.log(`Total tokens used: ${cumulativeTokens}`);

  const report = generateReport(results, models, quillFormats);
  const reportPath = join(__dirname, 'report.md');
  writeFileSync(reportPath, report, 'utf8');

  console.log('─'.repeat(60));
  console.log(report);
  console.log(`\nReport saved to eval/report.md`);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
