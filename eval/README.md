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

# One model:
node eval/run.js --model qwen/qwen3.6-flash --trials 3

# The whole fleet (wrapper loops run.js over every model in config.json):
eval/run-all.sh --trials 3

# Reconstruct the cross-model matrix from all the per-model result files:
node eval/report.js eval/results/*.jsonl
```

`run.js` is **strictly single-model** — it runs one model (resolved from
`config.json` by `--model <name>`) over every prompt. Fan-out across the fleet
lives in the wrapper, `run-all.sh`. This keeps each run isolated, resumable, and
independently costed; the full matrix (including systematic-failure detection) is
rebuilt afterwards by pointing `report.js` at the results dir.

`run.js` flags:

| Flag | Default | Purpose |
|---|---|---|
| `--model <name>` | — | Config model to run (exact `name`). Required unless `--mock`. |
| `--mock` | off | Skip config; use built-in mock |
| `--preflight-only` | off | Probe the model (crib query) and exit — cheap slug/key/mode check before committing to a full run |
| `--trials N` | `3` | Trials per prompt |
| `--concurrency N` | `2` | Concurrent in-flight requests to the model |

`run-all.sh` flags:

| Flag | Default | Purpose |
|---|---|---|
| `-j, --jobs N` | `1` | Models to run in parallel (default sequential) |
| *(any run.js flag)* | — | Forwarded verbatim to each per-model run |

Everything else is hard-coded for KISS:

- Config: `eval/config.json` (falls back to `eval/config.example.json`)
- Prompts: `eval/prompts.json`
- Output: `eval/results/<timestamp>__<model>.jsonl` (one file per run)
- Caps: 12 tool calls and 5 `create_document` attempts per run

Edit those files or the constants at the top of `run.js` to change behavior.
A single-model summary table prints to stdout at the end of each run; use
`node eval/report.js eval/results/*.jsonl` to combine runs into the full matrix.

## Concurrency

Most wall-clock time is spent waiting on the LLM provider's HTTP response, so
two levels of parallelism keep things quick without much complexity:

- **Within a model** — `--concurrency N` (run.js) caps how many of that model's
  `prompts × trials` requests are in flight at once. Default 2: gentle on rate
  limits, ~2x faster than serial. The single MCP client is shared across these
  (JSON-RPC ids match responses to requests, so concurrent `callTool`s are safe).
- **Across models** — `-j N` (run-all.sh) runs up to N models' processes at
  once. Default 1 (sequential) for clean, non-interleaved logs.

Dial either up if your providers can take it, or down to `1` when chasing a
flaky provider or diffing against a baseline. If you see runs failing with
`provider_error` due to HTTP 429s, lower whichever knob is hammering that
provider.

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
| `preflightMaxTokens` | integer | Override the crib-probe token budget (reasoning models default to 1024, others 64). |
| `extraBody` | object | Merged into the request body, e.g. `{ "reasoning": { "effort": "low" } }` for OpenRouter reasoning control. |

> Note: every model in this harness must support **native tool calling** —
> the loop is built on OpenAI `tools`/`tool_choice`. Models without it (e.g. the
> Phi-4 family on OpenRouter) can't be driven here and are intentionally excluded.

**Preflight is per-model:** before any prompts run, the model gets one crib
query to prove its slug, key, and endpoint actually work. A failed probe aborts
*that* model's run (no tokens wasted on the full matrix). Under `run-all.sh` the
remaining models still run — each is its own process, so one failure just yields
a non-zero exit. Use `--preflight-only` (optionally via `run-all.sh
--preflight-only`) to validate the whole fleet for a few hundred tokens before
committing to a real run.

## Selecting models

Every entry in the `models` array runs against every prompt × every trial.
To pick which models to evaluate, edit `eval/config.json` and delete the
entries you don't want. JSON doesn't support comments, so there's no
"comment out" — just remove the object.

Suggested workflow:

1. `cp eval/config.example.json eval/config.json` (the gitignored copy).
2. Open `eval/config.json` and delete every model you don't want to run.
3. Add new models by appending objects matching the schema above.

### Current fleet

The shipped `config.json` holds 12 models — 9 open-weight on OpenRouter plus
three hosted OpenAI models — each confirmed reliably evaluable: they support
native tool calling and pass the live `--preflight-only` crib probe (reachable
+ valid key + mode wired):

| Model | Mode | Notes |
|---|---|---|
| `google/gemma-4-26b-a4b-it` | standard | |
| `mistralai/ministral-14b-2512` | standard | |
| `mistralai/ministral-8b-2512` | standard | |
| `mistralai/ministral-3b-2512` | standard | weakest in spot runs (~25% success) |
| `qwen/qwen3.6-flash` | reasoning | larger token budget + lenient crib |
| `nvidia/nemotron-3-super-120b-a12b` | reasoning | |
| `meta-llama/llama-4-scout` | multimodal | text path only |
| `meta-llama/llama-4-maverick` | multimodal | text path only |
| `openai/gpt-oss-120b` | reasoning | larger token budget + lenient crib |
| `gpt-5.4-mini` | reasoning | hosted OpenAI API; `max_completion_tokens`, default reasoning effort |
| `gpt-5.4-nano` | reasoning | hosted OpenAI API; newest low-end OpenAI model |
| `gpt-5.5` | reasoning | hosted OpenAI API; current flagship |

> **GPT-5-family caveat.** On `/v1/chat/completions` these models reject
> `reasoning_effort` whenever function tools are present (the API steers you to
> `/v1/responses`), so the config omits it and lets the model use its default
> effort. They also require `max_completion_tokens` (set via `maxTokensParam`)
> and reject a non-default `temperature`, so `temperature` is left unset. The
> OpenAI entries read `OPENAI_API_KEY`.

"Reliably evaluable" means the harness can drive it, not that it scores well —
preflight only proves reachability. Run `node eval/run.js --list-models` to
print the names your `config.json` will actually sweep, or `eval/run-all.sh
--preflight-only` to re-verify the whole fleet cheaply.

To try just one model, you don't need to touch the config at all — pass its
`name` to `--model`:

```sh
node eval/run.js --model meta-llama/llama-4-scout --trials 3
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
`eval/config.json`. If the selected model's env var is unset, the run fails
fast with a clear error; under `run-all.sh` the remaining models still run.

For convenience, dotenv-style loading is **not** built in — keep it KISS.
Two common patterns:

```sh
# Per-shell:
source ~/.config/quillmark-eval.env

# Per-invocation:
env $(cat .env | xargs) eval/run-all.sh
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

All shipped prompts are **explicit**: each opens with "Using the quillmark
tools, render … with the `<quill>` quill" and names the target quill. We're
testing **flow ergonomics** — whether the model can correctly drive
`list_quills → get_spec → create_document` and recover from errors — not
whether it spontaneously decides to use the system, nor whether it picks the
right quill from `list_quills` given a vague request. A model that answers in
prose instead of calling `create_document` is failing the stated task, not
being probed on tool-volunteering; the shared system prompt in `run.js` also
states plainly that calling `create_document` is the only way to complete the
task. Add discovery / vague-request prompts separately if that's interesting
later.

## JSONL record shape

One record per run, written to `eval/results/<ts>__<model>.jsonl`:

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
  "toolChainOrdered": true,
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

`calledGetSpecsBeforeCreate` and `toolChainOrdered` both judge tool-call
discipline and are `null` when the model never reached `create_document` (no
chain to grade). `calledGetSpecsBeforeCreate` is the narrow check — did
`get_spec` precede the first `create_document`. `toolChainOrdered` is the
stricter one — did the model drive the whole prescribed chain
(`list_quills?` → `get_spec` → `create_document`) in order: `get_spec` present,
the first call to each prescribed step ascending in canonical order, and
`list_quills` (if used) before `get_spec`. A model that lists quills *after*
fetching the spec, or jumps straight to `create_document`, is `false` here even
if it eventually succeeds.

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
- `chain` — fraction of runs that drove the whole `list_quills? → get_spec →
  create_document` chain in the prescribed order (of runs that reached
  `create_document`). Stricter than `specs1st`: it also catches out-of-order
  discovery (e.g. `list_quills` after `get_spec`). A gap between `specs1st` and
  `chain` localizes *where* models break sequence
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
