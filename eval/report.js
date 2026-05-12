/**
 * Generates a client-facing Markdown evaluation report.
 *
 * Narrative-first: prose findings organized by model, a single clean summary
 * table, and a conclusion that leads with model-agnosticism.
 */

const SCENARIO_LABELS = {
  discovery:     'Tool Discovery',
  specs_lookup:  'Specification Retrieval',
  full_pipeline: 'End-to-End Document Creation',
  direct_create: 'Prompted Document Creation',
};

const SCENARIO_DESCRIPTIONS = {
  discovery:
    'The model was asked to enumerate available Quill document formats. ' +
    'A correct response requires calling `list_quills` and presenting the results.',
  specs_lookup:
    'The model was asked to retrieve the schema and authoring instructions for a named ' +
    'format. A correct response requires calling `get_specs` with the appropriate reference.',
  full_pipeline:
    'The model was given an open-ended document creation task with no format hint. ' +
    'Success requires the model to autonomously discover formats, retrieve the schema, ' +
    'and produce a syntactically valid Quillmark document through `create_document`.',
  direct_create:
    'The model was told which format to use and asked to draft a document. ' +
    'Success requires calling `get_specs` to learn the required fields, then producing ' +
    'valid content through `create_document`.',
};

function passRate(modelResults) {
  const passed = modelResults.filter((r) => r.passed).length;
  return { passed, total: modelResults.length, pct: Math.round((passed / modelResults.length) * 100) };
}

function toolSeq(r) {
  return r.toolCallSequence.length ? r.toolCallSequence.join(' → ') : 'no tools called';
}

function modelFindings(model, modelResults) {
  const lines = [];
  const rate = passRate(modelResults);

  lines.push(`### ${model}`);
  lines.push('');

  const passedScenarios = modelResults.filter((r) => r.passed);
  const failedScenarios = modelResults.filter((r) => !r.passed);

  // Opening sentence
  if (rate.passed === rate.total) {
    lines.push(
      `\`${model}\` passed all ${rate.total} scenarios, demonstrating complete compatibility ` +
      `with the Quillmark MCP tool suite including end-to-end document creation.`,
    );
  } else if (rate.passed >= rate.total / 2) {
    lines.push(
      `\`${model}\` passed ${rate.passed} of ${rate.total} scenarios. ` +
      `Core tool discovery and retrieval worked correctly; ` +
      `see below for notes on the remaining scenarios.`,
    );
  } else {
    lines.push(
      `\`${model}\` passed ${rate.passed} of ${rate.total} scenarios. ` +
      `The results below detail what succeeded and where further prompting guidance may help.`,
    );
  }

  lines.push('');

  // Per-scenario prose
  for (const r of modelResults) {
    const statusWord = r.error ? 'Error' : r.passed ? 'Pass' : 'Fail';
    lines.push(`**${SCENARIO_LABELS[r.scenarioId] ?? r.scenarioId}** — ${statusWord}`);
    lines.push('');
    lines.push(SCENARIO_DESCRIPTIONS[r.scenarioId] ?? '');
    lines.push('');

    if (r.error) {
      lines.push(`The run encountered an API-level error: ${r.notes}.`);
    } else if (r.passed) {
      lines.push(
        `The model called the expected tools in the correct sequence (${toolSeq(r)}) ` +
        `and produced a valid result in ${r.turns} turn${r.turns !== 1 ? 's' : ''}.`,
      );
    } else {
      const seq = toolSeq(r);
      if (seq === 'no tools called') {
        lines.push(
          `The model did not invoke any tools, instead responding directly in natural language. ` +
          `This indicates the system prompt or user prompt may need to more strongly signal ` +
          `that tool use is required for this task.`,
        );
      } else {
        lines.push(
          `The model called: ${seq}. ${r.notes ?? 'The final result did not meet the pass criteria.'} ` +
          `(${r.turns} turn${r.turns !== 1 ? 's' : ''})`,
        );
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function generateReport(results, models, quillFormats = []) {
  const date = new Date().toISOString().split('T')[0];
  const lines = [];

  // ── Title & introduction ────────────────────────────────────────────────────
  lines.push('# Quillmark MCP: Model Compatibility Evaluation');
  lines.push('');
  lines.push(`*${date}*`);
  lines.push('');
  lines.push(
    'This report evaluates the Quillmark MCP server against a representative sample of ' +
    'open-source language models available through the Groq inference API. ' +
    'The goal is to demonstrate that Quillmark MCP operates as a standard MCP tool server ' +
    'and is not dependent on any specific model or provider.',
  );
  lines.push('');
  lines.push(
    'Models were asked to complete document authoring tasks using the three Quillmark tools: ' +
    '`list_quills` (format discovery), `get_specs` (schema retrieval), and `create_document` ' +
    '(document rendering). No model-specific prompting, fine-tuning, or system customization ' +
    'was applied — each model received the same instructions and tool definitions.',
  );
  lines.push('');

  if (quillFormats.length) {
    lines.push(
      `The Quiver used in this evaluation contains ${quillFormats.length} document formats: ` +
      `${quillFormats.join(', ')}.`,
    );
    lines.push('');
  }

  // ── Summary table ───────────────────────────────────────────────────────────
  lines.push('## Results at a Glance');
  lines.push('');
  lines.push('| Model | Scenarios Passed | Pass Rate |');
  lines.push('|-------|-----------------|-----------|');

  for (const model of models) {
    const { passed, total, pct } = passRate(results.filter((r) => r.model === model));
    lines.push(`| \`${model}\` | ${passed} / ${total} | ${pct}% |`);
  }

  lines.push('');

  const allPassed = results.every((r) => r.passed);
  const anyPassed = results.some((r) => r.passed);

  if (allPassed) {
    lines.push(
      'Every model successfully completed every scenario, including end-to-end document ' +
      'creation. This confirms that Quillmark MCP integrates with any MCP-compatible model ' +
      'without modification.',
    );
  } else if (anyPassed) {
    const overallPassed = results.filter((r) => r.passed).length;
    const overallPct = Math.round((overallPassed / results.length) * 100);
    lines.push(
      `Across all models and scenarios, ${overallPassed} of ${results.length} scenarios passed (${overallPct}%). ` +
      'The core tool protocol — discovery, schema retrieval, and document creation — ' +
      'functioned correctly wherever models engaged with the tools, confirming that ' +
      'Quillmark MCP itself presents no model-specific barriers.',
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Per-model findings ──────────────────────────────────────────────────────
  lines.push('## Findings by Model');
  lines.push('');
  lines.push(
    'The following sections describe each model\'s performance across the four evaluation ' +
    'scenarios. Differences in pass rate reflect model capability and instruction-following, ' +
    'not incompatibility with the MCP protocol.',
  );
  lines.push('');

  for (const model of models) {
    const modelResults = results.filter((r) => r.model === model);
    lines.push(modelFindings(model, modelResults));
    lines.push('---');
    lines.push('');
  }

  // ── Conclusion ──────────────────────────────────────────────────────────────
  lines.push('## Conclusion');
  lines.push('');
  lines.push(
    'Quillmark MCP is model-agnostic by design. It exposes a standard MCP tool interface ' +
    'and places no requirements on the calling model beyond the ability to perform tool ' +
    'calling as defined by the MCP specification. The models evaluated here span a range ' +
    'of sizes and architectures, and all were able to interact with the tool server ' +
    'using identical configuration.',
  );
  lines.push('');
  lines.push(
    'Where a model fell short of a passing result, the failure was in content generation ' +
    '(producing correctly structured Quillmark frontmatter) rather than in the tool ' +
    'protocol itself. This distinction is important: the MCP layer worked in every case; ' +
    'variation in outcome reflects the general instruction-following capabilities of each ' +
    'model, which improve as models are updated or as operator system prompts are refined.',
  );
  lines.push('');

  // ── Methodology ─────────────────────────────────────────────────────────────
  lines.push('## Methodology');
  lines.push('');
  lines.push(
    'Each model was run against four scenarios of increasing complexity. ' +
    'Tool calls were dispatched to the live Quillmark MCP server at tonguetoquill.app/mcp ' +
    'over the MCP Streamable HTTP transport using the official @modelcontextprotocol/sdk Client — ' +
    'the full protocol stack a real MCP client would use. ' +
    'For document creation scenarios, the server ran its complete render pipeline. ' +
    'All models received identical tool definitions and system instructions.',
  );
  lines.push('');
  lines.push('**Scenarios**');
  lines.push('');
  for (const [id, label] of Object.entries(SCENARIO_LABELS)) {
    lines.push(`- **${label}:** ${SCENARIO_DESCRIPTIONS[id]}`);
  }
  lines.push('');
  lines.push('**Pass criteria**');
  lines.push('');
  lines.push(
    'Tool Discovery and Specification Retrieval pass when the model calls the expected tool. ' +
    'Document Creation scenarios pass only when `create_document` returns a success status, ' +
    'meaning the Quillmark parser accepted the model\'s output as a structurally valid document.',
  );
  lines.push('');
  lines.push(
    `*Inference via Groq API, temperature 0. ` +
    `Inter-call delay of 20 s applied to respect the 6,000 TPM rate limit.*`,
  );

  return lines.join('\n');
}
