# Ollama

> **Status (MCPHost + `qwen3:8b`):** ✅ **Tested** — end-to-end validated with a real rendered USAF memo (135 KB PDF) via `compose_document` on the sidecar endpoint. Evidence: `test/docker/mcp-protocol.test.js` Layer 5d + a live mcphost session in the repo's development history.
>
> **Status (MCPO + Open WebUI):** 🚧 **In Progress** — walkthrough ready, alt bridge not yet exercised end-to-end. <!-- ISSUE:ollama-mcpo -->
>
> **Status (other Ollama models):** 🚧 **In Progress** — only `qwen3:8b` has been driven through a live render. `qwen2.5:7b`, `qwen2.5:14b`, `llama3.1:8b`, `mistral-nemo`, `hermes3`, `granite3.x`, `phi4` are all theoretically compatible but unverified. <!-- ISSUE:ollama-models -->
>
> **Status (`qwen3.5:*`):** ❌ **Broken upstream** — Ollama wires `qwen3.5` to the wrong renderer/parser; tool calls leak as text output. Tracked at [ollama/ollama#14493](https://github.com/ollama/ollama/issues/14493) and [ollama/ollama#14745](https://github.com/ollama/ollama/issues/14745). Use `qwen3:8b` or `qwen2.5:*` instead.
>
> See [`docs/STATUS.md`](../STATUS.md) for the authoritative matrix.

Ollama itself does **not** speak MCP. It exposes an OpenAI-compatible chat API with tool calling, and that's it. To use MCP tools with an Ollama model you need a bridge. Two are in common use:

- **MCPHost** — a standalone Go binary that runs an agent loop against Ollama (or other local LLMs) and drives MCP servers. Good for CLI use.
- **MCPO** — the Open WebUI bridge. Takes an MCP server (stdio) and exposes it as an OpenAPI REST endpoint, which Open WebUI then consumes as a custom tool.

Pick MCPHost if you're using Ollama from the CLI; pick MCPO if you're using Open WebUI.

> ⚠ Model matters. The bridging layer is stateless — if the underlying Ollama model can't do tool calling reliably, you'll get hallucinated tool names and malformed arguments. Use Qwen 2.5/3.x, Llama 3.1/3.2/3.3, Mistral-Nemo, Mistral-Small, Hermes 3, Granite 3.x, Command-R, or Phi 4, and keep temperature ≤ 0.1.

---

## Option A — MCPHost (fully automated)

The repo ships `scripts/install-ollama.sh` which handles every step:

```sh
./scripts/install-ollama.sh
```

### Architecture — a dedicated sidecar container

Small local models (Qwen 8B, Llama 3.1 8B, Mistral-Nemo, etc.) struggle to produce valid YAML frontmatter as a single escaped string argument, which is what the standard `create_document` tool expects. They fumble indentation, forget `---` delimiters, escape newlines as `\\n`, and churn through failed retries until they give up and emit the document as chat text.

To fix this without changing the contract Claude Code and other hosted-model clients rely on, `install-ollama.sh` launches a **separate Quillmark container** named `quillmark-mcp-ollama` on port **8765** with `QUILLMARK_LOCAL_MODEL_MODE=1` set. That env flag tells the server to expose a fourth tool — `compose_document` — which takes **structured JSON parameters** (`quill`, `fields` as a plain JSON object, `body`) and assembles the YAML on the server side. Small models only need to emit JSON, which they handle well.

```
┌──────────────────┐                              ┌───────────────────────────────┐
│ Claude Code,     │   http://127.0.0.1:8080/mcp  │ quillmark-mcp container       │
│ Cursor, VS Code, │ ───────────────────────────▶ │   default                     │
│ Codex, etc.      │                              │   3 tools: list_quills,       │
│                  │                              │     get_specs, create_document│
└──────────────────┘                              └───────────────────────────────┘

┌──────────────────┐                              ┌───────────────────────────────┐
│ MCPHost (Ollama) │   http://127.0.0.1:8765/mcp  │ quillmark-mcp-ollama sidecar  │
│                  │ ───────────────────────────▶ │   QUILLMARK_LOCAL_MODEL_MODE=1│
│                  │                              │   4 tools: + compose_document │
└──────────────────┘                              └───────────────────────────────┘
```

The two containers share the same image, same renderer, same artifacts directory — only the exposed tool surface differs. Claude Code's contract is untouched.

### What the script does

1. Verifies `ollama` is installed and its daemon is reachable.
2. Installs `mcphost` if missing (Homebrew → prebuilt binary → `go install`, in that order).
3. Scans `ollama list` for a tool-calling-capable model you already have pulled (Qwen 3, Qwen 2.5, Llama 3.1/3.2/3.3, Mistral-Nemo/Small, Hermes 3, Granite 3.x, Command-R, Phi 4). If none are present, pulls `qwen2.5:7b` (~4.7 GB).
4. Starts the `quillmark-mcp-ollama` sidecar on port 8765 with `QUILLMARK_LOCAL_MODEL_MODE=1`.
5. Writes `~/.mcphost.json` pointing at the sidecar.
6. Launches `mcphost` with `--max-steps 30` and a focused system prompt that tells the model to prefer `compose_document` and forbids emitting the document as chat text.

### Flags

```sh
./scripts/install-ollama.sh --yes                     # non-interactive
./scripts/install-ollama.sh --model qwen2.5:14b       # force a specific model
./scripts/install-ollama.sh --port 9765               # custom sidecar port (default 8765)
./scripts/install-ollama.sh --max-steps 50            # agent loop cap (default 30)
./scripts/install-ollama.sh --no-launch               # set up but don't open a chat
./scripts/install-ollama.sh --no-server               # assume sidecar is already up
./scripts/install-ollama.sh --stop                    # stop and remove the sidecar
```

### Verify without starting a chat

```sh
./scripts/install-ollama.sh --yes --no-launch --model qwen3:8b

# Prove the sidecar serves 4 tools including compose_document
curl -sS -X POST http://127.0.0.1:8765/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -c 500

# End-to-end: mcphost → model → compose_document → real PDF
mcphost -m ollama:qwen3:8b --config ~/.mcphost.json --max-steps 30 --quiet -p '
Execute these two tool calls in sequence, no text output between them:
Step 1: Call get_specs with ref="usaf_memo". Read the result silently.
Step 2: Call compose_document with these arguments:
  quill: "usaf_memo"
  fields: {
    "memo_from": ["673 ABW/CC", "JBER AK 99506"],
    "memo_for": ["ALL PERSONNEL"],
    "subject": "Reflective Belt Test",
    "signature_block": ["JOHN Q. DOE, Colonel, USAF", "Commander"]
  }
  body: "1. Test paragraph."
After step 2 returns, output only the url from its result.
'

# Should print an http://127.0.0.1:8765/artifacts/...pdf URL
open ~/.quillmark/artifacts/*.pdf
```

### System prompt and prompt wording matter

Local models in MCPHost's `-p` (non-interactive) mode will exit as soon as they emit a text response. If the model calls `get_specs`, reads the schema, and then starts "explaining" the schema as chat — mcphost terminates before the second tool call. Three mitigations:

1. **Always pass `--system-prompt`** when running `mcphost`. Without it, even interactive mode will frequently fail — the model reads the schema and explains it instead of calling `compose_document`. The `install-ollama.sh` script creates a tuned system prompt automatically; manual invocations must supply their own.
2. **The built-in system prompt** (wired by `install-ollama.sh`) tells the model to prefer `compose_document` and forbids chat output between steps. It helps but can't override everything.
3. **Be explicit in your user prompt**: literally say "Call compose_document with these arguments: {...}" and include a JSON blob of the fields you want. Small models follow literal instructions much better than open-ended "render a memo about X" prompts.

In interactive mode (without `-p`), you can iterate — if the model explains instead of calling the tool, just say "now call compose_document with those fields" and it will.

### Manual setup (if you'd rather skip the script)

```sh
# 1. Install MCPHost
brew install mcphost                            # macOS
go install github.com/mark3labs/mcphost@latest  # from source
# or download from github.com/mark3labs/mcphost/releases/latest

# 2. Pull a tool-calling-capable Ollama model
ollama pull qwen2.5:7b

# 3. Write ~/.mcphost.json (or generate it:  node src/bin.js mcphost-config --url http://127.0.0.1:8080/mcp )
cat > ~/.mcphost.json <<'EOF'
{
  "mcpServers": {
    "quillmark": {
      "type": "remote",
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
EOF

# 4. Run MCPHost (--system-prompt is required — see note below)
mcphost -m ollama:qwen2.5:7b --config ~/.mcphost.json --system-prompt <path-to-prompt-file>
```

> **`--system-prompt` is required for reliable tool calling.** Without it, small models (8B–14B) will call `get_specs`, read the schema, and then dump the entire schema as chat text instead of calling `compose_document`. The system prompt tells the model to prefer `compose_document` and never emit document content as text. `install-ollama.sh` handles this automatically; manual invocations must include it.
>
> The script writes a temporary system prompt file at launch. To create your own persistent copy:
>
> ```sh
> # Extract the system prompt from install-ollama.sh, or write your own.
> # At minimum it should instruct the model to:
> #   - ALWAYS prefer compose_document over create_document
> #   - NEVER emit the document body as chat text
> #   - Follow the chain: get_specs → compose_document → return URL
> ```

See the copy-paste walkthrough generated for your environment with:

```sh
node src/bin.js config ollama-mcphost
```

### Verify

Once `mcphost` starts, ask:

> List available quills and render the usaf_memo example.

Expect a tool-call trace followed by a `file://` URL pointing to `~/.quillmark/artifacts/<uuid>.pdf`.

### Model recommendations

| Model | Size | Tool calling | Notes |
|---|---|---|---|
| `qwen3:14b` | 14B | Good | Known-good default |
| `qwen3:32b` | 32B | Excellent | Best for multi-step tool chains |
| `llama3.3:70b` | 70B | Excellent | Heavy but reliable |
| `hermes3:8b` | 8B | OK | Smallest viable option |
| `glm-4:9b` | 9B | OK | Alternative small option |

**Temperature ≤ 0.1** is important — at higher temperatures these models start inventing tool names that don't exist, and MCPHost will return errors that the model can't recover from.

---

## Option B — MCPO (Open WebUI bridge)

MCPO is the officially supported Open WebUI → MCP bridge. It takes a stdio MCP server, exposes it as an OpenAPI REST endpoint, and Open WebUI consumes that endpoint as a custom tool.

### Prerequisites

- Open WebUI installed and pointing at Ollama
- `quillmark-mcp:dev` image built: `./scripts/install-mcp.sh --no-server`
- Python 3.10+ (for `mcpo`)

### Install

```sh
pip install mcpo

# Launch mcpo wrapping a per-session Quillmark container
mcpo -- docker run -i --rm \
  --user 10001:10001 --read-only --tmpfs /tmp \
  --cap-drop=ALL --security-opt=no-new-privileges:true \
  -v "$HOME/.quillmark/artifacts:$HOME/.quillmark/artifacts" \
  -e "QUILLMARK_OUTPUT_DIR=$HOME/.quillmark/artifacts" \
  -e "QUILLMARK_BASE_URL=file://" \
  -e "QUILLMARK_STDIO=1" \
  quillmark-mcp:dev --stdio
```

Generate this exact command with:

```sh
node src/bin.js config ollama-mcpo
```

MCPO listens on `http://127.0.0.1:8000` by default (configurable via `mcpo --port`). Its `/docs` endpoint is a Swagger UI you can inspect.

### Wire into Open WebUI

Open WebUI → Settings → Tools → **Add** → paste the mcpo OpenAPI URL (`http://127.0.0.1:8000/openapi.json` or equivalent). Open WebUI will introspect the schema and add each Quillmark tool as a custom Open WebUI tool.

---

## Gotchas

- **`--system-prompt` is mandatory.** Without it, small models will read the schema and explain it as text instead of calling `compose_document`. Always pass `--system-prompt <file>` when invoking `mcphost` manually. `install-ollama.sh` handles this automatically.
- **MCPHost is third-party.** Release cadence and API stability aren't controlled by Quillmark or Ollama. Pin to a known-good version in team environments.
- **Ollama doesn't have native MCP support** (GitHub issue [#7865](https://github.com/ollama/ollama/issues/7865) tracks this). Until/unless that lands, a bridge is mandatory.
- **Cold start.** The first tool call after `mcphost`/`mcpo` starts takes ~1-2s longer than subsequent ones — Ollama is warming up the model.
- **qwen3.5 is broken for tool calling** at time of writing. Ollama issues [#14493](https://github.com/ollama/ollama/issues/14493) and [#14745](https://github.com/ollama/ollama/issues/14745) document that Ollama wires qwen3.5 to the wrong renderer/parser; tool calls leak as plain text. Use `qwen3:8b`, `qwen2.5:7b`, or `qwen2.5:14b` — all tested to work with `compose_document`.
- **Multi-step chains need a capable model.** 8B models can do single tool calls reliably. Multi-step chains (`list_quills → get_specs → compose_document`) start working at qwen3:8b with `compose_document` + the sidecar's system prompt, but 14B+ is more forgiving on ambiguous prompts. If you have the disk: `./scripts/install-ollama.sh --yes --model qwen2.5:14b`.

## Relationship to Claude Code

The sidecar container is **completely isolated** from the default Claude Code endpoint on port 8080. Running `install-ollama.sh` does not modify, restart, or reconfigure the default container in any way. You can run both simultaneously:

```sh
./scripts/install-mcp.sh              # port 8080 for Claude Code et al.
./scripts/install-ollama.sh           # port 8765 for MCPHost (adds compose_document)
```

Two containers, two ports, two isolated tool surfaces. Tear down independently:

```sh
./scripts/uninstall-mcp.sh --yes      # stops the Claude Code container
./scripts/install-ollama.sh --stop    # stops the Ollama sidecar
```
