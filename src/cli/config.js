/**
 * @module config
 *
 * MCP config snippet generator for Claude Code and Codex CLI.
 *
 * Pure function. Given a target client and transport mode, returns the exact
 * config blob to paste or the shell command to run. No file I/O, no network.
 * Other MCP clients integrate directly against the standard HTTP/stdio
 * transports we expose — we ship snippets only for the two CLIs we actively
 * support.
 */

const DEFAULTS = {
  name: 'quillmark',
  url: 'http://127.0.0.1:8080/mcp',
  artifactsDir: '$HOME/.quillmark/artifacts',
  image: 'quillmark-mcp:dev',
};

const SUPPORTED = {
  'claude-code': ['http', 'stdio'],
  'codex':       ['http', 'stdio'],
};

export const SUPPORTED_CLIENTS = Object.keys(SUPPORTED);

export function isSupported(client, mode) {
  const modes = SUPPORTED[client];
  return Array.isArray(modes) && modes.includes(mode);
}

/**
 * @typedef {Object} ConfigSnippet
 * @property {'shell'|'toml'} format
 * @property {string|null} suggestedPath
 * @property {string} content
 * @property {string[]} [notes]
 */

/**
 * Resolve the template for a (client, mode) pair and return a ready-to-use snippet.
 *
 * @param {Object} opts
 * @param {string} opts.client
 * @param {'http'|'stdio'} [opts.mode='http']
 * @param {string} [opts.name]
 * @param {string} [opts.url]
 * @param {string} [opts.artifactsDir]
 * @param {string} [opts.image]
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
  } = opts;

  if (!SUPPORTED[client]) {
    throw new Error(`Unknown client "${client}". Supported: ${SUPPORTED_CLIENTS.join(', ')}`);
  }
  if (!SUPPORTED[client].includes(mode)) {
    throw new Error(
      `Client "${client}" does not support mode "${mode}". ` +
        `Supported modes: ${SUPPORTED[client].join(', ')}`,
    );
  }

  const ctx = { name, url, artifactsDir, image };
  return client === 'claude-code' ? claudeCode(mode, ctx) : codex(mode, ctx);
}

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

function claudeCode(mode, ctx) {
  if (mode === 'http') {
    return {
      format: 'shell',
      suggestedPath: null,
      content: `claude mcp add --transport http ${ctx.name} ${ctx.url}\n`,
      notes: [`Verify: claude mcp list | grep ${ctx.name}`],
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

function codex(mode, ctx) {
  if (mode === 'http') {
    return {
      format: 'toml',
      suggestedPath: '~/.codex/config.toml (user)  |  .codex/config.toml (project)',
      content: `[mcp_servers.${ctx.name}]\nurl = "${ctx.url}"\n`,
      notes: [`Alternative: codex mcp add ${ctx.name} ${ctx.url}`],
    };
  }
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
