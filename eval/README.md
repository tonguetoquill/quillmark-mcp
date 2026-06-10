# eval

A small harness for measuring **MCP flow ergonomics** against the local
`quillmark-mcp` server. It drives an OpenAI-compatible tool-use loop, logs
per-run telemetry as JSONL, and aggregates into a per-model summary.

The goal is **not** to evaluate model quality — it's to see how well low-end
models can complete the `list_quills → get_spec → create_document` flow,
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

Flags:

| Flag | Default | Purpose |
|---|---|---|
| `--mock` | off | Skip config; use built-in mock |
| `--preflight-only` | off | Probe every model (crib query) and exit — cheap slug/key/mode check before committing to a full run |
| `--trials N` | `3` | Trials per (model, prompt) |
| `--concurrency N` | `2` | Concurrent runs across the matrix |

Everything else is hard-coded for KISS:

- Config: `eval/config.json` (falls back to `eval/config.example.json`)
- Prompts: `eval/prompts.json`
- Output: `eval/results/<timestamp>.jsonl`
- Caps: 12 tool calls and 5 `create_document` attempts per run

Edit those files or the constants at the top of `run.js` to change behavior.
A summary table prints to stdout at the end of the run — no separate
`report.js` invocation needed unless you're combining multiple files.

## Concurrency

Most wall-clock time is spent waiting on the LLM provider's HTTP response,
so a small worker pool gives a big speedup with minimal complexity.
`--concurrency N` runs N tasks from the (model, prompt, trial) matrix in
parallel. Default is 2 — gentle on rate limits, ~2x faster than serial.

Tasks are ordered `trial -> prompt -> model` so adjacent tasks differ in
model: with 2 workers across multiple providers, the pair tends to hit
distinct providers rather than hammering one. The single MCP client is
shared across workers (JSON-RPC ids match responses to requests, so
concurrent `callTool`s are safe).

Dial it up if your providers can take it (`--concurrency 4` or `8`),
or down to `1` for fully serial behavior — useful when chasing a flaky
provider or diffing against a baseline run. If you see runs failing with
`provider_error` due to HTTP 429s, lower concurrency.

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

### Model modes

Different model families need different handling. Declare it per entry so the
harness adapts instead of failing mid-run:

| Field | Values | Effect |
|---|---|---|
| `mode` | `standard` (default), `reasoning`, `multimodal` | `reasoning` grants a bigger preflight budget, a lenient crib check (a healthy 200 counts even if the literal echo is buried/truncated by thinking), and preserves `reasoning`/`reasoning_content` across tool turns. `multimodal` is documentation — we only send text. |
| `toolMode` | `native` (default), `prompted` | `prompted` is for models with **no native function calling** (the Phi-4 family). The harness omits `tools`/`tool_choice` (which such providers reject) and instead lists the tools in the system prompt, parsing calls back out of the model's text as `{"tool": "...", "arguments": {...}}`. |
| `preflightMaxTokens` | integer | Override the crib-probe token budget (reasoning models default to 1024, others 64). |
| `extraBody` | object | Merged into the request body, e.g. `{ "reasoning": { "effort": "low" } }` for OpenRouter reasoning control. |

**Preflight is now best-effort:** an unreachable / misconfigured model (bad
slug, missing key, dead endpoint) is logged and **skipped**, and the rest of the
fleet still runs. The probe only aborts if *every* model fails. Use
`--preflight-only` to validate the whole fleet for a few hundred tokens before
committing to the full matrix.

## Selecting models

Every entry in the `models` array runs against every prompt × every trial.
To pick which models to evaluate, edit `eval/config.json` and delete the
entries you don't want. JSON doesn't support comments, so there's no
"comment out" — just remove the object.

Suggested workflow:

1. `cp eval/config.example.json eval/config.json` (the gitignored copy).
2. Open `eval/config.json` and delete every model you don't want to run.
3. Add new models by appending objects matching the schema above.

The example config ships with a representative low-end set —
`claude-haiku-4-5`, `gpt-4o-mini`, `llama-3.1-8b-instruct`,
`qwen-2.5-7b-instruct`, `gemini-2.0-flash`, `llama-3.1-8b-instant`
(Groq) — so a one-line edit is usually enough.

To try just one model without touching the file, point the harness at a
one-off config:

```sh
node -e "
  const c = require('./eval/config.example.json');
  console.log(JSON.stringify({ models: c.models.filter(m => m.name === 'meta-llama/llama-3.1-8b-instruct') }, null, 2));
" > eval/config.json
node eval/run.js --trials 3
```

## API keys

The harness reads the bearer token from the env var named in each model's
`apiKeyEnv` field. Get a key from the provider, export it in your shell, then
run. Keys never get read from a file by the harness — only from env.

```sh
# Anthropic — https://console.anthropic.com/settings/keys
export ANTHROPIC_API_KEY=sk-ant-...

# OpenRouter (one key, hundreds of models) — https://openrouter.ai/keys
export OPENROUTER_API_KEY=sk-or-v1-...

# Groq (fast Llama / Mixtral) — https://console.groq.com/keys
export GROQ_API_KEY=gsk_...

# OpenAI — https://platform.openai.com/api-keys
export OPENAI_API_KEY=sk-...
```

You only need keys for the providers actually referenced in your
`eval/config.json`. If a referenced env var is unset, the run for that
model fails fast with a clear error and other models continue.

For convenience, dotenv-style loading is **not** built in — keep it KISS.
Two common patterns:

```sh
# Per-shell:
source ~/.config/quillmark-eval.env

# Per-invocation:
env $(cat .env | xargs) node eval/run.js
```

Never commit `eval/config.json` if you bake keys into it (you shouldn't —
use env vars). The `eval/.gitignore` already excludes `config.json` and
`results/`.

## Prompt fixtures

```json
{
  "id": "memo",
  "quill": "usaf_memo",
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
  "promptId": "memo",
  "quill": "usaf_memo",
  "trial": 1,
  "success": true,
  "createAttempts": 2,
  "toolCallCount": 4,
  "toolSequence": ["list_quills", "get_spec", "create_document", "create_document"],
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
model_stopped_without_success, provider_error, no_assistant_message,
output_truncated}`. `output_truncated` (model hit the token cap before emitting
a tool call — common when a reasoning model's budget is too low) classifies as
`infra`, not a model failure.

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
- `specs1st` — fraction of runs that called `get_spec` before
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
