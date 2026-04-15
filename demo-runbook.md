# Quillmark MCP Demo Runbook

Three AI services (Claude Code, Codex, Ollama) rendering the same USAF memo simultaneously through one MCP document server.

```
Terminal 1: Claude Code    --HTTP-->  quillmark-mcp        (port 8080, 3 tools)
Terminal 2: Codex CLI      --HTTP-->  quillmark-mcp        (port 8080, 3 tools)
Terminal 3: MCPHost/Ollama --HTTP-->  quillmark-mcp-ollama (port 8765, 4 tools)
```

---

## 1. Pre-Flight Checks

Run these from the repo root (`~/Development/quillmark-mcp`):

```sh
# Docker running?
docker ps --filter "name=quillmark" --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'

# Ollama daemon up?
ollama list

# CLI tools on PATH?
claude --version
codex --version
mcphost --version
```

**Expected:** Two healthy containers, `qwen3:8b` in Ollama model list, all three CLIs respond.

---

## 2. Docker Bring-Up (if containers aren't running)

Single command from repo root:

```sh
# Build image (skip if already built)
docker build -t quillmark-mcp:dev .

# Start main server (port 8080) -- Claude Code + Codex
docker compose up -d

# Start Ollama sidecar (port 8765) -- MCPHost
./scripts/install-ollama.sh --yes --no-launch --model qwen3:8b
```

**Verify both endpoints respond:**

```sh
# Port 8080 (Claude Code + Codex)
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/mcp

# Port 8765 (Ollama sidecar)
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/mcp
```

Both should return `404` (GET on a POST-only endpoint = healthy).

---

## 3. Client Configuration

### Claude Code

```sh
claude mcp add --transport http quillmark http://127.0.0.1:8080/mcp
```

Verify:

```sh
claude mcp list | grep quillmark
```

### Codex CLI

Append to `~/.codex/config.toml`:

```toml
[mcp_servers.quillmark]
url = "http://127.0.0.1:8080/mcp"
```

Verify:

```sh
codex mcp list
```

### Ollama / MCPHost

Already configured at `~/.mcphost.json`. Verify:

```sh
cat ~/.mcphost.json
```

Should show:

```json
{
  "mcpServers": {
    "quillmark": {
      "type": "remote",
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

---

## 4. The Demo -- Three Terminals, One Prompt

Open three terminal windows side by side. Each gets the same memo request.

### Terminal 1: Claude Code

```sh
claude
```

Once Claude Code starts, paste:

```
Use the quillmark MCP tools to render a USAF memo. First call get_specs with ref usaf_memo to learn the schema, then render a memo FROM 673 ABW/CC, Joint Base Elmendorf-Richardson AK 99506, TO ALL PERSONNEL, SUBJECT: Cybersecurity Awareness Training Compliance. The memo body should state that all personnel must complete annual cybersecurity awareness training by 30 April 2026, and that failure to comply will result in network access suspension. Signature block: JANE A. SMITH, Colonel, USAF, Commander.
```

### Terminal 2: Codex CLI

```sh
codex
```

Once Codex starts, paste the same prompt:

```
Use the quillmark MCP tools to render a USAF memo. First call get_specs with ref usaf_memo to learn the schema, then render a memo FROM 673 ABW/CC, Joint Base Elmendorf-Richardson AK 99506, TO ALL PERSONNEL, SUBJECT: Cybersecurity Awareness Training Compliance. The memo body should state that all personnel must complete annual cybersecurity awareness training by 30 April 2026, and that failure to comply will result in network access suspension. Signature block: JANE A. SMITH, Colonel, USAF, Commander.
```

### Terminal 3: Ollama via MCPHost

**The `--system-prompt` flag is required.** Without it, qwen3:8b will explain the schema as chat text instead of calling tools.

```sh
mcphost -m ollama:qwen3:8b --config ~/.mcphost.json --max-steps 30 --system-prompt ./demo-system-prompt.txt
```

Once the MCPHost prompt appears, paste:

```
Execute these tool calls in sequence, no text output between them:
Step 1: Call get_specs with ref="usaf_memo". Read the result silently.
Step 2: Call compose_document with these arguments:
  quill: "usaf_memo"
  fields: {
    "memo_from": ["673 ABW/CC", "Joint Base Elmendorf-Richardson AK 99506"],
    "memo_for": ["ALL PERSONNEL"],
    "subject": "Cybersecurity Awareness Training Compliance",
    "signature_block": ["JANE A. SMITH, Colonel, USAF", "Commander"],
    "date": "2026-04-13",
    "letterhead_caption": ["JOINT BASE ELMENDORF-RICHARDSON"]
  }
  body: "All personnel assigned to the 673d Air Base Wing must complete annual cybersecurity awareness training no later than 30 April 2026.\n\n- Training is available on the Air Force myLearning portal\n- Supervisors will verify completion via ADLS records\n\nFailure to comply by the stated deadline will result in immediate suspension of network access privileges until training is completed and verified."
After step 2 returns, output only the url from its result.
```

**Why the explicit prompt?** Small models (8B) follow literal tool-call instructions much better than open-ended "render a memo about X" prompts. The natural language version often causes the model to explain the schema instead of acting on it.

After MCPHost returns a URL, open it:

```sh
open ~/.quillmark/artifacts/usaf_memo-*.pdf
```

---

## 5. Verify Output

After all three complete:

```sh
# List all generated PDFs
ls -lt ~/.quillmark/artifacts/*.pdf | head -10

# Open the most recent ones (macOS)
open ~/.quillmark/artifacts/*.pdf
```

Each service should have produced a PDF at `~/.quillmark/artifacts/usaf_memo-<uuid>.pdf`.

---

## 6. Teardown

```sh
# Stop main container (Claude Code + Codex endpoint)
cd ~/Development/quillmark-mcp
./scripts/uninstall-mcp.sh --yes

# Stop Ollama sidecar
./scripts/install-ollama.sh --stop

# Remove Claude Code MCP config
claude mcp remove quillmark

# Remove Codex MCP config (delete the [mcp_servers.quillmark] block from ~/.codex/config.toml)
# Or leave it -- it's harmless when the server is down.
```

---

## Quick Reference

| Service | Port | Tools | Config Location |
|---|---|---|---|
| Claude Code | 8080 | list_quills, get_specs, create_document | `claude mcp add` / `~/.claude.json` |
| Codex CLI | 8080 | list_quills, get_specs, create_document | `~/.codex/config.toml` |
| Ollama/MCPHost | 8765 | list_quills, get_specs, create_document, **compose_document** | `~/.mcphost.json` |

**Why two ports?** Small Ollama models can't produce valid YAML frontmatter, so the sidecar on 8765 exposes a 4th tool (`compose_document`) that accepts structured JSON and assembles the YAML server-side. Claude Code and Codex use port 8080 with the standard 3-tool contract.

**Model note:** Use `qwen3:8b` for the demo. The `qwen3.5:*` models have a known upstream bug (ollama/ollama#14493) where tool calls leak as text.

**System prompt is mandatory for Ollama.** Without `--system-prompt ./demo-system-prompt.txt`, the model will call `get_specs`, read the schema, and then dump the entire schema as chat text instead of calling `compose_document`. The system prompt tells the model to prefer `compose_document` and never emit document content as text.
