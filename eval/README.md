# eval

A small harness for measuring **MCP flow ergonomics** against the local
`quillmark-mcp` server. It drives an OpenAI-compatible tool-use loop, logs
per-run telemetry as JSONL, and aggregates into a per-model summary.

The goal is **not** to evaluate model quality — it's to see how well low-end
models can complete the `list_quills → get_specs → create_document` flow,
and where they get stuck.

## Quick start (no API keys)

```sh
node eval/run.js --mock --trials 2
node eval/report.js eval/results/<timestamp>.jsonl
```

The `--mock` provider is a hard-coded happy-path responder that exercises
the whole wiring (MCP stdio transport, tool-schema translation, tool result
roundtrip, JSONL logging). Useful to verify the harness still works after
changes to the MCP surface.

## Quick start (real models)

```sh
cp eval/config.example.json eval/config.json
# Edit eval/config.json to keep only the models you want to test.

export ANTHROPIC_API_KEY=...
export OPENROUTER_API_KEY=...
# ...whichever providers your config references

node eval/run.js --trials 3
node eval/report.js eval/results/<timestamp>.jsonl
```

Flags worth knowing:

| Flag | Default | Purpose |
|---|---|---|
| `--config <path>` | `eval/config.example.json` | Model config JSON |
| `--prompts <path>` | `eval/prompts.json` | Prompt fixtures |
| `--out <path>` | `eval/results/<ts>.jsonl` | Output file |
| `--trials <n>` | `3` | Trials per (model, prompt) |
| `--max-tool-calls <n>` | `12` | Hard cap per run |
| `--max-create-attempts <n>` | `5` | Cap on `create_document` retries |
| `--filter-model <name>` | — | Restrict to one model |
| `--filter-prompt <id>` | — | Restrict to one prompt |
| `--mock` | off | Ignore config; use built-in mock |

## Config schema

Each model entry hits an OpenAI-compatible `/chat/completions` endpoint:

```json
{
  "name": "meta-llama/llama-3.1-8b-instruct",
  "baseUrl": "https://openrouter.ai/api/v1",
  "apiKeyEnv": "OPENROUTER_API_KEY",
  "extraHeaders": { "HTTP-Referer": "..." },
  "temperature": 0,
  "maxTokens": 4096
}
```

`name` is sent verbatim as the request `model` field. `apiKeyEnv` names the
env var holding the bearer token. `extraHeaders` is optional (e.g. OpenRouter
likes `HTTP-Referer` / `X-Title`).

## Prompt fixtures

```json
{
  "id": "memo_easy",
  "quill": "usaf_memo",
  "difficulty": "easy",
  "prompt": "Use the usaf_memo quill to render..."
}
```

All shipped prompts name the target quill explicitly. We're testing
**flow ergonomics** — whether the model can correctly call the tools and
recover from errors — not whether it picks the right quill from
`list_quills` given a vague request. Add discovery prompts separately if
that's interesting later.

## JSONL record shape

One record per run, written to `eval/results/<ts>.jsonl`:

```json
{
  "model": "meta-llama/llama-3.1-8b-instruct",
  "promptId": "memo_easy",
  "quill": "usaf_memo",
  "difficulty": "easy",
  "trial": 1,
  "success": true,
  "createAttempts": 2,
  "toolCallCount": 4,
  "toolSequence": ["list_quills", "get_specs", "create_document", "create_document"],
  "calledGetSpecsBeforeCreate": true,
  "errors": [
    { "attempt": 3, "tool": "create_document", "category": "schema_missing_field", "message": "..." }
  ],
  "errorCategories": ["schema_missing_field"],
  "renderedUrl": "http://localhost:8080/artifacts/usaf_memo-....pdf",
  "totalTokens": 3142,
  "durationMs": 4821,
  "terminationReason": "completed",
  "timestamp": "2026-05-13T11:01:33.187Z"
}
```

`terminationReason` ∈ `{completed, max_create_attempts, max_tool_calls,
model_stopped_without_success, provider_error, no_assistant_message}`.

Error categories (regex over diagnostic text in `createDocument`):

- `missing_quill_field` — no `QUILL:` line in YAML
- `yaml_parse` — `Document.fromMarkdown` blew up
- `unknown_quill` — referenced quill doesn't exist
- `schema_missing_field` — required field absent
- `tool_input_schema` — model called the tool with malformed args
- `render_failure` / `template_failure` — Quillmark/Typst rendering error
- `other` — didn't match a known pattern

## Reporter output

```
model                                  n    success mean-att med-att p90-att specs1st self-corr mean-tools mean-tok
-------------------------------------- ---- ------- -------- ------- ------- -------- --------- ---------- ---------
mock://happy-path                      16   100.0%   1.00     1.00    1.00   100.0%     0.0%     3.00           0.00

# mock://happy-path
  errorCategories: (none)
  termination:     {"completed":16}
```

- `success` — fraction of runs where `create_document` returned non-error
- `mean-att` / `med-att` / `p90-att` — attempts-to-success distribution
  (only over successful runs)
- `specs1st` — fraction of runs that called `get_specs` before
  `create_document`. Low values suggest models are jumping straight to
  `create_document` and failing
- `self-corr` — fraction of successful runs that needed >1 attempt.
  High values mean the diagnostic UX is doing real work
- `errorCategories` — count of distinct categories per model. Tells you
  whether to invest in better instructions, schema, or diagnostics

`--json` emits the same data as machine-readable JSON.

## Caveats

- **Tool-use compatibility varies by provider.** Some small Llamas served
  via vLLM don't reliably emit `tool_calls` and instead hallucinate the
  call in `content`. If a model's runs are dominated by
  `model_stopped_without_success`, that's the cause — it's a provider
  property, not an MCP issue.
- **The error categorizer is regex-on-diagnostic-text.** Robust enough
  for the current MCP, but if diagnostic wording changes, categories
  silently fall through to `other`. Re-tune
  `categorizeError()` in `run.js` after the first real runs.
- **No judge.** Success = `create_document` returned non-error. We don't
  check that the rendered PDF actually reflects the user's request.
  Adding an LLM judge would catch models that satisfy the schema with
  garbage; out of scope for now.
