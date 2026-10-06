import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { depositsRouter } from './routes/deposits.js';
import { walletRouter } from './routes/wallet.js';
import { savingsRouter } from './routes/savings.js';
import { withdrawalsRouter } from './routes/withdrawals.js';

export const app = express();

const rateLimiter = new RateLimiterMemory({
  points: env.RATE_LIMIT_MAX_REQUESTS,
  duration: env.RATE_LIMIT_WINDOW_MS / 1000,
});

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((entry) => entry.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);

app.use((req, res, next) => {
  const clientKey = req.ip ?? 'anonymous';

  rateLimiter
    .consume(clientKey)
    .then(() => next())
    .catch(() => {
      logger.warn({ requestId: req.id, ip: clientKey }, 'Rate limit exceeded');
      res.status(429).json({
        ok: false,
        error: 'Too Many Requests',
        requestId: req.id,
      });
    });
});

app.get('/api/v1', (_req, res) => {
  res.status(200).json({
    ok: true,
    name: env.APP_NAME,
    version: env.API_VERSION,
    status: 'ready',
  });
});

app.use('/api/v1', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/wallet', walletRouter);
app.use('/api/v1/deposits', depositsRouter);
app.use('/api/v1/savings', savingsRouter);
app.use('/api/v1/withdrawals', withdrawalsRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
