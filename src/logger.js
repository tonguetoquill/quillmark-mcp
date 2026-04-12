/**
 * @module logger
 * Stderr-only structured logging — stdout is reserved for the stdio JSON-RPC wire protocol.
 *
 * Wraps `loglevel` with a custom method factory that prepends ISO timestamps and
 * uppercased severity to every message. Supports plain strings, Error objects,
 * and structured metadata (object first, message rest).
 *
 * Set `LOG_LEVEL` env var to control verbosity (`trace` | `debug` | `info` | `warn` | `error` | `silent`).
 * Defaults to `info`.
 */
import log from 'loglevel';

/**
 * Active log level, sourced from `LOG_LEVEL` env var or defaulting to `'info'`.
 * @type {string}
 */
const level = process.env.LOG_LEVEL || 'info';

// Format log messages with timestamp and level
const originalFactory = log.methodFactory;
log.methodFactory = (methodName, logLevel, loggerName) => {
  const rawMethod = originalFactory(methodName, logLevel, loggerName);

  return (...args) => {
    const timestamp = new Date().toISOString();
    const levelStr = methodName.toUpperCase();

    // Handle both simple strings and structured logging (object + message)
    let message = '';
    if (args.length === 0) {
      message = '';
    } else if (args.length === 1) {
      const arg = args[0];
      if (typeof arg === 'string') {
        message = arg;
      } else if (arg instanceof Error) {
        message = arg.message;
      } else {
        message = JSON.stringify(arg);
      }
    } else {
      // Multiple args: first arg is metadata, rest is message
      const [metadata, ...rest] = args;
      const textMsg = rest.join(' ');
      const metaStr = typeof metadata === 'object' && !(metadata instanceof Error)
        ? JSON.stringify(metadata)
        : String(metadata);
      message = `${metaStr} ${textMsg}`.trim();
    }

    const formatted = `[${timestamp}] ${levelStr} ${message}`;
    rawMethod(formatted);
  };
};

log.setLevel(level);

/**
 * Pre-configured loglevel instance with timestamped, level-prefixed formatting.
 * All output goes to stderr so it never contaminates the stdio MCP transport.
 *
 * @type {object}
 *
 * @example
 * logger.info('Server started');
 * logger.debug({ reqId: 'abc' }, 'Handling request');
 * logger.error(new Error('boom'));
 */
export const logger = log;
