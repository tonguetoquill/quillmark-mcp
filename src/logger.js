import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const isPretty = process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV === 'development';

const config = {
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
};

const transport = isPretty
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        singleLine: false,
      },
    }
  : undefined;

export const logger = pino(config, transport ? pino.transport(transport) : undefined);
