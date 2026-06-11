import log from 'loglevel';

const level = process.env.LOG_LEVEL || 'info';

log.methodFactory = (methodName) => {
  return (message) => {
    const timestamp = new Date().toISOString();
    // Stderr only — stdout is reserved for the stdio JSON-RPC wire protocol.
    process.stderr.write(`[${timestamp}] ${methodName.toUpperCase()} ${message}\n`);
  };
};

log.setLevel(level);

export const logger = log;
