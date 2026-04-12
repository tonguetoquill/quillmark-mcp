# OpenAI API — Responses API + Agents SDK

> **Status:** 🚧 **In Progress** — code samples for both Responses API (hosted MCP tool) and Agents SDK (`MCPServerStreamableHttp`) are generated and shape-verified, but neither has been executed against a live Quillmark server yet.
> Help validate either path: see [`docs/STATUS.md`](../STATUS.md) for acceptance criteria and the tracking issues. <!-- ISSUE:openai-responses --> <!-- ISSUE:openai-agents -->

> **Note:** The Responses API hosted MCP tool runs in OpenAI's cloud and requires a publicly reachable URL (cloudflared / tailscale funnel / ngrok). The Agents SDK runs in your Python process and works with `127.0.0.1` directly — use it for local validation.

Using the OpenAI API (the developer API, not the ChatGPT product) you have two first-class ways to call an MCP server:

1. **Responses API hosted MCP tool** — declarative, runs in OpenAI's infra. No local client needed. But OpenAI's servers make the outbound call, so the server must be publicly reachable.
2. **Agents SDK `MCPServerStreamableHttp`** — runs in your Python/JS process, opens a direct HTTP connection to the MCP server. Works with `127.0.0.1` because the agent loop runs locally.

For local dev, use the Agents SDK. For production + cloud agents, use the Responses API with a tunnel/deployment.

## Prerequisites

- `./scripts/install-mcp.sh` → server on `http://127.0.0.1:8080/mcp`
- `OPENAI_API_KEY` in your environment

## Option 1 — Responses API (hosted MCP tool)

```js
// Node / TypeScript
import OpenAI from 'openai';

const client = new OpenAI();

const response = await client.responses.create({
  model: 'gpt-5',
  input: 'List available quill formats, then render the usaf_memo example.',
  tools: [
    {
      type: 'mcp',
      server_label: 'quillmark',
      server_url: 'http://127.0.0.1:8080/mcp',
      allowed_tools: ['list_quills', 'get_specs', 'create_document'],
      require_approval: 'never',
    },
  ],
});

console.log(response.output_text);
```

Generate this snippet on demand:

```sh
node src/bin.js config openai-responses
```

> ⚠ OpenAI's hosted MCP tool runs in OpenAI's cloud — it cannot reach `127.0.0.1`. For real use, expose the server publicly (cloudflared / tailscale funnel / ngrok) and use the public URL in `server_url`.

### Responses API — key fields

- `server_label` — a short identifier used in the response trace.
- `server_url` — the MCP endpoint. **Must be publicly reachable.**
- `allowed_tools` — whitelist. Omit to allow every tool the server exposes.
- `require_approval` — `"never"`, `"once"`, or `"always"`. For read-only servers you can safely use `"never"`.
- `headers` — passed through on every tool call. Use this for bearer-token auth.

Headers and server URLs are **discarded post-request** by OpenAI (only the schema/domain is retained for tracing), so bearer tokens don't leak to other customers.

## Option 2 — Agents SDK (local MCP)

This is what you want for local dev. The SDK launches in your process, opens a direct HTTP connection to `http://127.0.0.1:8080/mcp`, and drives a full agent loop.

```python
# Python
import asyncio
from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

async def main():
    async with MCPServerStreamableHttp(
        name='quillmark',
        params={'url': 'http://127.0.0.1:8080/mcp'},
    ) as mcp:
        agent = Agent(
            name='Document Assistant',
            instructions='Use quillmark tools to render markdown documents.',
            mcp_servers=[mcp],
        )
        result = await Runner.run(
            agent,
            'List available quill formats, then render the usaf_memo example.',
        )
        print(result.final_output)

if __name__ == '__main__':
    asyncio.run(main())
```

Install the SDK: `pip install openai-agents`

Generate the snippet: `node src/bin.js config openai-agents`

### Agents SDK — transport options

- `MCPServerStdio` — local subprocess via stdio.
- `MCPServerStreamableHttp` — **preferred** for new work.
- `MCPServerSse` — deprecated.
- `HostedMCPTool` — offloads to Responses API hosted infra (same as Option 1 above but wrapped).

## Why not Chat Completions?

The Chat Completions API has no built-in MCP client. You'd have to hand-roll an MCP client and proxy tool calls through function calling — lots of glue for no benefit. **Use Responses API or Agents SDK instead.** The Assistants API is deprecated (sunset August 2026); don't build new things on it.
