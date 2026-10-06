import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({
  path: fileURLToPath(new URL('../../../../.env', import.meta.url)),
});

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Pochi Langu'),
  APP_PORT: z.coerce.number().int().positive().default(4000),
  APP_BASE_URL: z.string().url().default('http://localhost:4000'),
  API_VERSION: z.string().default('v1'),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(15432),
  POSTGRES_DB: z.string().default('pochi_langu'),
  POSTGRES_USER: z.string().min(1).default('pochi_langu_app'),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_ADMIN_USER: z.string().min(1).default('pochi_langu'),
  POSTGRES_ADMIN_PASSWORD: z.string().min(1),
  POSTGRES_MIGRATION_ROLE: z.string().min(1).default('pochi_langu_migration'),
  POSTGRES_MIGRATION_PASSWORD: z.string().min(1),
  POSTGRES_APP_ROLE: z.string().min(1).default('pochi_langu_app'),
  POSTGRES_APP_PASSWORD: z.string().min(1),
  POSTGRES_CA_CERT: z.string().optional(),
  POSTGRES_USE_SYSTEM_CA: z.coerce.boolean().default(false),
  ALLOW_DESTRUCTIVE_NON_PRODUCTION_ROLLBACK: z.coerce.boolean().default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  DARAJA_BASE_URL: z.string().url().default('https://sandbox.safaricom.co.ke'),
  DARAJA_CONSUMER_KEY: z.string().optional(),
  DARAJA_CONSUMER_SECRET: z.string().optional(),
  DARAJA_BUSINESS_SHORTCODE: z.string().regex(/^\d+$/).optional(),
  DARAJA_PASSKEY: z.string().optional(),
  DARAJA_CALLBACK_URL: z.string().url().optional(),
  DARAJA_TRANSACTION_DESCRIPTION: z.string().min(1).max(100).default('Pochi Langu deposit'),
}).superRefine((values, context) => {
  if (values.NODE_ENV === 'production' && !values.POSTGRES_CA_CERT && !values.POSTGRES_USE_SYSTEM_CA) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['POSTGRES_CA_CERT'],
      message: 'POSTGRES_CA_CERT is required in production unless POSTGRES_USE_SYSTEM_CA=true',
    });
  }
});

export const parseEnvironment = (input: NodeJS.ProcessEnv) => envSchema.parse(input);

export const env = parseEnvironment(process.env);
