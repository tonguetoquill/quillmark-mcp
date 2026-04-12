// Client-agnostic MCP config snippet generator.
//
// Pure function. Given a target client and deployment mode, return the exact
// config blob the developer needs to paste into that client's config file (or
// run as a CLI command, or embed in code). No file I/O, no network, no Docker.
//
// The caller owns resolving environment-dependent values (absolute
// artifactsDir path, custom URL/port) and passes them in. The generator
// itself only templates strings — this is what makes the golden snapshot
// tests deterministic.
//
// Every template here is covered by test/cli/config-snapshot.test.js.

const DEFAULTS = {
  name: 'quillmark',
  url: 'http://127.0.0.1:8080/mcp',
  artifactsDir: '$HOME/.quillmark/artifacts',
  image: 'quillmark-mcp:dev',
};

const SUPPORTED = {
  'claude-code':     ['http', 'stdio'],
  'claude-desktop':  ['stdio'],
  'cursor':          ['http'],
  'vscode':          ['http'],
  'cline':           ['http'],
  'continue':        ['http'],
  'codex':           ['http', 'stdio'],
  'chatgpt':         ['http'],
  'openai-responses':['http'],
  'openai-agents':   ['http'],
  'ollama-mcphost':  ['http'],
  'ollama-mcpo':     ['stdio'],
};

export const SUPPORTED_CLIENTS = Object.keys(SUPPORTED);

export function isSupported(client, mode) {
  const modes = SUPPORTED[client];
  return Array.isArray(modes) && modes.includes(mode);
}

/**
 * @typedef {Object} ConfigSnippet
 * @property {'json'|'toml'|'yaml'|'text'|'shell'|'js'|'python'} format
 * @property {string|null} suggestedPath  File the user should paste into,
 *   or null if the target is a CLI command / walkthrough / code sample.
 * @property {string} content  The snippet to copy.
 * @property {string[]} [notes]  Short caveats printed alongside the snippet.
 */

/**
 * @param {{
 *   client: keyof typeof SUPPORTED,
 *   mode?: 'http' | 'stdio',
 *   name?: string,
 *   url?: string,
 *   artifactsDir?: string,
 *   image?: string,
 *   authToken?: string,
 * }} opts
 * @returns {ConfigSnippet}
 */
export function generateConfig(opts = {}) {
  const {
    client,
    mode = 'http',
    name = DEFAULTS.name,
    url = DEFAULTS.url,
    artifactsDir = DEFAULTS.artifactsDir,
    image = DEFAULTS.image,
    authToken,
  } = opts;

  if (!SUPPORTED[client]) {
    throw new Error(
      `Unknown client "${client}". Supported: ${SUPPORTED_CLIENTS.join(', ')}`,
    );
  }
  if (!SUPPORTED[client].includes(mode)) {
    throw new Error(
      `Client "${client}" does not support mode "${mode}". ` +
        `Supported modes: ${SUPPORTED[client].join(', ')}`,
    );
  }

  const ctx = { name, url, artifactsDir, image, authToken };

  switch (client) {
    case 'claude-code':      return claudeCode(mode, ctx);
    case 'claude-desktop':   return claudeDesktop(ctx);
    case 'cursor':           return cursor(ctx);
    case 'vscode':           return vscode(ctx);
    case 'cline':            return cline(ctx);
    case 'continue':         return continueClient(ctx);
    case 'codex':            return codex(mode, ctx);
    case 'chatgpt':          return chatgpt(ctx);
    case 'openai-responses': return openaiResponses(ctx);
    case 'openai-agents':    return openaiAgents(ctx);
    case 'ollama-mcphost':   return ollamaMcphost(ctx);
    case 'ollama-mcpo':      return ollamaMcpo(ctx);
    default:                 throw new Error(`unreachable: ${client}`);
  }
}

// ─── stdio docker-run args (shared) ────────────────────────────────────────

function dockerRunArgs({ artifactsDir, image }) {
  return [
    'run', '-i', '--rm',
    '--user', '10001:10001',
    '--read-only', '--tmpfs', '/tmp',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '-v', `${artifactsDir}:${artifactsDir}`,
    '-e', `QUILLMARK_OUTPUT_DIR=${artifactsDir}`,
    '-e', 'QUILLMARK_BASE_URL=file://',
    '-e', 'QUILLMARK_STDIO=1',
    image,
    '--stdio',
  ];
}

function authHeaderJson(authToken) {
  return authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : null;
}

function indentJson(obj) {
  return JSON.stringify(obj, null, 2);
}

// ─── Claude Code ────────────────────────────────────────────────────────────

function claudeCode(mode, ctx) {
  if (mode === 'http') {
    const headerArgs = ctx.authToken
      ? ` --header "Authorization: Bearer ${ctx.authToken}"`
      : '';
    return {
      format: 'shell',
      suggestedPath: null,
      content: `claude mcp add --transport http ${ctx.name}${headerArgs} ${ctx.url}\n`,
      notes: [
        'Alternative: edit ~/.claude.json (user) or .mcp.json (project).',
        'Verify: claude mcp list | grep ' + ctx.name,
      ],
    };
  }
  const args = dockerRunArgs(ctx).join(' ');
  return {
    format: 'shell',
    suggestedPath: null,
    content: `claude mcp add ${ctx.name} -- docker ${args}\n`,
    notes: ['Each Claude Code session spawns its own container.'],
  };
}

// ─── Claude Desktop (stdio only) ────────────────────────────────────────────

function claudeDesktop(ctx) {
  const body = {
    mcpServers: {
      [ctx.name]: {
        command: 'docker',
        args: dockerRunArgs(ctx),
      },
    },
  };
  return {
    format: 'json',
    suggestedPath:
      '~/Library/Application Support/Claude/claude_desktop_config.json (macOS)  ' +
      '|  %APPDATA%\\Claude\\claude_desktop_config.json (Windows)',
    content: indentJson(body) + '\n',
    notes: [
      'Claude Desktop\'s Settings → Connectors UI routes through Anthropic\'s cloud and cannot reach localhost.',
      'The stdio form above is the only way to connect a local Docker container.',
      'Restart Claude Desktop after editing this file.',
    ],
  };
}

// ─── Cursor ─────────────────────────────────────────────────────────────────

function cursor(ctx) {
  const server = { url: ctx.url };
  const auth = authHeaderJson(ctx.authToken);
  if (auth) Object.assign(server, auth);
  return {
    format: 'json',
    suggestedPath: '.cursor/mcp.json (project)  |  ~/.cursor/mcp.json (global)',
    content: indentJson({ mcpServers: { [ctx.name]: server } }) + '\n',
    notes: [
      'Cursor has a ~40-tool global cap across all MCP servers; keep your server count lean.',
    ],
  };
}

// ─── VS Code Copilot Chat ───────────────────────────────────────────────────

function vscode(ctx) {
  // NOTE: VS Code uses the key "servers" — NOT "mcpServers".
  // This is the single biggest copy-paste footgun in the MCP ecosystem.
  const server = { type: 'http', url: ctx.url };
  const auth = authHeaderJson(ctx.authToken);
  if (auth) Object.assign(server, auth);
  return {
    format: 'json',
    suggestedPath: '.vscode/mcp.json (workspace)  |  User profile via "MCP: Open User Configuration"',
    content: indentJson({ servers: { [ctx.name]: server } }) + '\n',
    notes: [
      'VS Code uses the key "servers" — NOT "mcpServers". Pasting a Cursor/Claude snippet will silently fail.',
      'MCP tools only work in Copilot Chat Agent mode.',
    ],
  };
}

// ─── Cline ──────────────────────────────────────────────────────────────────

function cline(ctx) {
  const server = { url: ctx.url };
  const auth = authHeaderJson(ctx.authToken);
  if (auth) Object.assign(server, auth);
  return {
    format: 'json',
    suggestedPath:
      'VS Code extension globalStorage: saoudrizwan.claude-dev/settings/cline_mcp_settings.json',
    content: indentJson({ mcpServers: { [ctx.name]: server } }) + '\n',
    notes: ['Use Cline\'s MCP Servers UI (Settings → MCP Servers) to locate or open this file.'],
  };
}

// ─── Continue ───────────────────────────────────────────────────────────────

function continueClient(ctx) {
  const server = { type: 'streamable-http', url: ctx.url };
  const auth = authHeaderJson(ctx.authToken);
  if (auth) Object.assign(server, auth);
  return {
    format: 'json',
    suggestedPath: `.continue/mcpServers/${ctx.name}.json`,
    content: indentJson({ mcpServers: { [ctx.name]: server } }) + '\n',
    notes: [
      'Continue accepts Claude-Desktop-style JSON drop-ins. YAML with explicit type: streamable-http also works.',
      'Agent mode only.',
    ],
  };
}

// ─── Codex CLI ──────────────────────────────────────────────────────────────

function codex(mode, ctx) {
  if (mode === 'http') {
    const lines = [
      `[mcp_servers.${ctx.name}]`,
      `url = "${ctx.url}"`,
    ];
    if (ctx.authToken) {
      lines.push('bearer_token_env_var = "QUILLMARK_TOKEN"');
    }
    return {
      format: 'toml',
      suggestedPath: '~/.codex/config.toml (user)  |  .codex/config.toml (project)',
      content: lines.join('\n') + '\n',
      notes: [
        'Alternative: codex mcp add ' + ctx.name + ' ' + ctx.url,
        ctx.authToken
          ? 'Set $QUILLMARK_TOKEN in your shell env before running Codex.'
          : '',
      ].filter(Boolean),
    };
  }
  // stdio mode
  const args = dockerRunArgs(ctx);
  const argList = args.map((a) => `"${a}"`).join(', ');
  const lines = [
    `[mcp_servers.${ctx.name}]`,
    'command = "docker"',
    `args = [${argList}]`,
  ];
  return {
    format: 'toml',
    suggestedPath: '~/.codex/config.toml (user)  |  .codex/config.toml (project)',
    content: lines.join('\n') + '\n',
    notes: ['Each Codex session spawns its own container.'],
  };
}

// ─── ChatGPT (walkthrough) ──────────────────────────────────────────────────

function chatgpt(ctx) {
  const steps = [
    'ChatGPT Business / Team / Enterprise / Edu / Pro — Custom MCP Server',
    '',
    '1. Workspace owner/admin enables Developer Mode:',
    '   Workspace Settings → Permissions & Roles → Developer Mode → ON',
    '',
    '2. User enables it on their account:',
    '   Settings → Apps & Connectors → Advanced settings → Developer Mode → ON',
    '',
    '3. Create the connector:',
    '   Settings → Connectors → Create',
    `     Name: ${ctx.name}`,
    `     URL:  ${ctx.url}`,
    '     Auth: ' + (ctx.authToken ? 'OAuth or bearer token' : 'None'),
    '',
    '⚠ ChatGPT\'s backend runs in OpenAI\'s cloud and cannot reach 127.0.0.1.',
    '  Expose the server publicly for real use — e.g.:',
    '    cloudflared tunnel --url http://127.0.0.1:8080',
    '    tailscale funnel 8080',
    '    ngrok http 8080',
    '  Then replace the URL above with the public tunnel URL.',
    '',
    '⚠ ChatGPT consumer (Free/Plus) does NOT support custom MCP servers.',
    '  You need Business, Team, Enterprise, Edu, or Pro.',
  ];
  return {
    format: 'text',
    suggestedPath: null,
    content: steps.join('\n') + '\n',
    notes: [],
  };
}

// ─── OpenAI Responses API (hosted MCP tool) ─────────────────────────────────

function openaiResponses(ctx) {
  const toolLines = [
    '    {',
    "      type: 'mcp',",
    `      server_label: '${ctx.name}',`,
    `      server_url: '${ctx.url}',`,
    "      allowed_tools: ['list_quills', 'get_specs', 'create_document'],",
    "      require_approval: 'never',",
  ];
  if (ctx.authToken) {
    toolLines.push(`      headers: { Authorization: 'Bearer ${ctx.authToken}' },`);
  }
  toolLines.push('    },');

  const code = [
    '// OpenAI Responses API — hosted MCP tool (Node/TypeScript)',
    "import OpenAI from 'openai';",
    '',
    'const client = new OpenAI();',
    '',
    'const response = await client.responses.create({',
    "  model: 'gpt-5',",
    "  input: 'List available quill formats, then render the usaf_memo example.',",
    '  tools: [',
    ...toolLines,
    '  ],',
    '});',
    '',
    'console.log(response.output_text);',
    '',
    '// ⚠ OpenAI\'s hosted MCP tool runs in OpenAI\'s cloud — it cannot reach',
    '//   127.0.0.1. Expose the Quillmark HTTP endpoint via cloudflared /',
    '//   tailscale funnel / ngrok, or use the Agents SDK path (local MCP).',
  ];
  return {
    format: 'js',
    suggestedPath: null,
    content: code.join('\n') + '\n',
    notes: [
      'Chat Completions API has no built-in MCP — use Responses API or Agents SDK.',
    ],
  };
}

// ─── OpenAI Agents SDK ──────────────────────────────────────────────────────

function openaiAgents(ctx) {
  const paramsLine = ctx.authToken
    ? `params={'url': '${ctx.url}', 'headers': {'Authorization': 'Bearer ${ctx.authToken}'}},`
    : `params={'url': '${ctx.url}'},`;
  const code = [
    '# OpenAI Agents SDK — local MCP via Streamable HTTP',
    'import asyncio',
    'from agents import Agent, Runner',
    'from agents.mcp import MCPServerStreamableHttp',
    '',
    'async def main():',
    '    async with MCPServerStreamableHttp(',
    `        name='${ctx.name}',`,
    `        ${paramsLine}`,
    '    ) as mcp:',
    '        agent = Agent(',
    "            name='Document Assistant',",
    "            instructions='Use quillmark tools to render markdown documents.',",
    '            mcp_servers=[mcp],',
    '        )',
    '        result = await Runner.run(',
    '            agent,',
    "            'List available quill formats, then render the usaf_memo example.',",
    '        )',
    '        print(result.final_output)',
    '',
    "if __name__ == '__main__':",
    '    asyncio.run(main())',
  ];
  return {
    format: 'python',
    suggestedPath: null,
    content: code.join('\n') + '\n',
    notes: [
      'Install: pip install openai-agents',
      'Agents SDK supports stdio, Streamable HTTP, SSE (deprecated), and hosted MCP.',
    ],
  };
}

// ─── Ollama via MCPHost ─────────────────────────────────────────────────────

function ollamaMcphostServerEntry(ctx) {
  // Modern MCPHost schema (>=0.33): type "remote" for HTTP transport.
  const server = { type: 'remote', url: ctx.url };
  if (ctx.authToken) {
    server.headers = [`Authorization: Bearer ${ctx.authToken}`];
  }
  return server;
}

function ollamaMcphost(ctx) {
  const configObj = { mcpServers: { [ctx.name]: ollamaMcphostServerEntry(ctx) } };
  const configJson = indentJson(configObj);
  const steps = [
    'Ollama via MCPHost (github.com/mark3labs/mcphost)',
    '',
    'FULLY AUTOMATED PATH:',
    '     ./scripts/install-ollama.sh',
    '  (installs mcphost if missing, picks or pulls a compatible model,',
    '   writes the config below, launches a chat session)',
    '',
    '--- or manual setup ---',
    '',
    '1. Install MCPHost:',
    '     brew install mcphost                                    # macOS',
    '     go install github.com/mark3labs/mcphost@latest          # from source',
    '     # or download a release binary from',
    '     # https://github.com/mark3labs/mcphost/releases/latest',
    '',
    '2. Pull a tool-calling-capable Ollama model (one of):',
    '     ollama pull qwen2.5:7b      # small + reliable',
    '     ollama pull qwen3:8b        # newer',
    '     ollama pull llama3.1:8b     # alternative',
    '     ollama pull mistral-nemo    # you already have this on many systems',
    '',
    '3. Write ~/.mcphost.json:',
    ...configJson.split('\n').map((l) => '     ' + l),
    '',
    '4. Run MCPHost:',
    '     mcphost -m ollama:qwen2.5:7b --config ~/.mcphost.json',
    '',
    '5. Ask: "list available quills and render the usaf_memo example"',
    '',
    '⚠ Model requirements:',
    '  • Must have Ollama tool-calling capability — Qwen 2.5+/3.x, Llama 3.1+,',
    '    Mistral-Nemo, Mistral-Small, Hermes 3, Granite 3.x, Command-R, Phi 4.',
    '  • Keep temperature ≤ 0.1 or the model may hallucinate tool names.',
    '  • 14B+ parameters give more reliable multi-tool chains.',
  ];
  return {
    format: 'text',
    suggestedPath: '~/.mcphost.json',
    content: steps.join('\n') + '\n',
    notes: [
      'Use ./scripts/install-ollama.sh for a one-command setup.',
      'MCPHost is a third-party binary; pin a known-good release for reproducibility.',
    ],
  };
}

// Exported so scripts/install-ollama.sh can write a minimal config without
// parsing the walkthrough text.
export function mcphostConfigJson(opts = {}) {
  const {
    name = DEFAULTS.name,
    url = DEFAULTS.url,
    authToken,
  } = opts;
  return (
    indentJson({
      mcpServers: {
        [name]: ollamaMcphostServerEntry({ name, url, authToken }),
      },
    }) + '\n'
  );
}

// ─── Ollama via MCPO (Open WebUI bridge) ────────────────────────────────────

function ollamaMcpo(ctx) {
  const args = dockerRunArgs(ctx).join(' ');
  const steps = [
    'Ollama via MCPO (Open WebUI OpenAPI bridge — github.com/open-webui/mcpo)',
    '',
    'MCPO exposes stdio MCP servers as OpenAPI REST endpoints, which Open WebUI',
    'then consumes as custom tools.',
    '',
    '1. Install mcpo:',
    '     pip install mcpo',
    '',
    '2. Launch mcpo wrapping a per-session Quillmark container:',
    '     mcpo -- docker ' + args,
    '',
    '3. In Open WebUI: Settings → Tools → Add the mcpo OpenAPI URL',
    '   (default http://127.0.0.1:8000 — see `mcpo --help` for flags).',
    '',
    '4. Select a tool-calling-capable Ollama model in Open WebUI and ask:',
    '   "list available quills and render the usaf_memo example"',
  ];
  return {
    format: 'text',
    suggestedPath: null,
    content: steps.join('\n') + '\n',
    notes: [
      'MCPO is the officially supported Open WebUI MCP bridge.',
      'For CLI-only Ollama use without Open WebUI, prefer MCPHost.',
    ],
  };
}
