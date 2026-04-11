import log from 'loglevel';

const level = process.env.LOG_LEVEL || 'info';

// Set the log level
log.setLevel(level);

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

export const logger = log;
