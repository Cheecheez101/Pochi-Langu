import { app } from './app.js';
import { assertSafeRuntimeDatabase, database } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const startup = async (): Promise<void> => {
  await assertSafeRuntimeDatabase(database);
  const server = app.listen(env.APP_PORT, () => {
    logger.info(
      {
        port: env.APP_PORT,
        baseUrl: env.APP_BASE_URL,
        app: env.APP_NAME,
      },
      'Pochi Langu backend listening',
    );
  });

  const shutdown = (): void => {
    logger.info('Shutting down server');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

void startup().catch(async (error: unknown) => {
  logger.fatal({ error }, 'Unsafe or unavailable database runtime; refusing to start');
  await database.destroy();
  process.exitCode = 1;
});
