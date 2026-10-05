import type { Knex } from 'knex';
import { env } from '../../config/env.js';

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;
const appRole = quoteIdentifier(env.POSTGRES_APP_ROLE);

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$
    BEGIN
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM ${appRole}', current_database());
    END $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$
    BEGIN
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM ${appRole}', current_database());
    END $$;
  `);
}
