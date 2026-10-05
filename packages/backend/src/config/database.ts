import knex, { type Knex } from 'knex';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../db/migrations', import.meta.url));
const SEEDS_DIR = fileURLToPath(new URL('../db/seeds', import.meta.url));

export function getDatabaseConfig(): Knex.Config {
  return {
    client: 'pg',
    connection: {
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      ssl: env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true, ca: env.POSTGRES_CA_CERT }
        : false,
    },
    pool: {
      min: 0,
      max: 10,
      idleTimeoutMillis: 30000,
    },
    migrations: {
      directory: MIGRATIONS_DIR,
      loadExtensions: ['.ts'],
      extension: 'ts',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: SEEDS_DIR,
      loadExtensions: ['.ts'],
      extension: 'ts',
    },
    useNullAsDefault: true,
  };
}

export function getMigrationDatabaseConfig(): Knex.Config {
  const config = getDatabaseConfig();
  const connection = config.connection;
  if (typeof connection === 'string' || typeof connection === 'function' || Array.isArray(connection)) {
    throw new Error('Migration database configuration requires object connection settings');
  }
  return {
    ...config,
    connection: {
      ...connection,
      user: env.POSTGRES_MIGRATION_ROLE,
      password: env.POSTGRES_MIGRATION_PASSWORD,
    },
  };
}

export const databaseConfig = getDatabaseConfig();
export const database = knex(databaseConfig);

export async function assertSafeRuntimeDatabase(database: Knex): Promise<void> {
  const result = await database.raw(`
    SELECT current_user,
           session_user,
           current_database() AS database,
           r.rolsuper AS is_superuser,
           pg_has_role(current_user, ?, 'member') AS is_owner_role_member,
           (
             SELECT count(*)
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public'
               AND c.relkind = 'r'
               AND c.relname IN (
                 'users', 'wallets', 'vaults', 'transactions',
                 'ledger_accounts', 'journal_entries', 'journal_lines'
               )
               AND pg_get_userbyid(c.relowner) = current_user
           ) AS owned_financial_tables
    FROM pg_roles r
    WHERE r.rolname = current_user
  `, [env.POSTGRES_MIGRATION_ROLE]);
  const identity = result.rows[0] as {
    current_user: string;
    session_user: string;
    is_superuser: boolean;
    is_owner_role_member: boolean;
    owned_financial_tables: string;
  } | undefined;

  if (!identity) {
    throw new Error('Database runtime identity could not be verified');
  }
  if (
    identity.current_user !== env.POSTGRES_APP_ROLE ||
    identity.session_user !== env.POSTGRES_APP_ROLE ||
    identity.is_superuser ||
    identity.is_owner_role_member ||
    Number(identity.owned_financial_tables) > 0
  ) {
    throw new Error(
      `Unsafe database runtime identity: current_user=${identity.current_user}, ` +
      `session_user=${identity.session_user}, is_superuser=${identity.is_superuser}, ` +
      `owner_role_member=${identity.is_owner_role_member}, ` +
      `owned_financial_tables=${identity.owned_financial_tables}`,
    );
  }
}
