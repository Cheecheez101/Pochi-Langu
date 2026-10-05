import pino from 'pino';
import { env } from '../config/env.js';

const transport =
  env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined;

export const logger = pino({
  name: env.APP_NAME,
  level: env.LOG_LEVEL,
  base: {
    service: env.APP_NAME,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(transport ? { transport } : {}),
});
