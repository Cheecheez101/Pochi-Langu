import { randomUUID } from 'node:crypto';
import knex from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertSafeRuntimeDatabase, getDatabaseConfig } from '../config/database.js';
import { env, parseEnvironment } from '../config/env.js';
import { down as initialDown } from '../db/migrations/20261004_000_initial.js';

const admin = knex({
  ...getDatabaseConfig(),
  connection: {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_MIGRATION_ROLE,
    password: env.POSTGRES_MIGRATION_PASSWORD,
  },
});
const appRole = knex({
  ...getDatabaseConfig(),
  connection: {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_APP_ROLE,
    password: env.POSTGRES_APP_PASSWORD,
  },
});
const ownerRole = knex({
  ...getDatabaseConfig(),
  connection: {
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_MIGRATION_ROLE,
    password: env.POSTGRES_MIGRATION_PASSWORD,
  },
});

describe('Phase 1 PostgreSQL catalog and runtime boundary', () => {
  beforeAll(async () => {
    await admin.raw('SELECT 1');
    await appRole.raw('SELECT 1');
  });

  afterAll(async () => {
    await appRole.destroy();
    await ownerRole.destroy();
    await admin.destroy();
  });

  it('runs the runtime as the restricted application role', async () => {
    const result = await appRole.raw(`
      SELECT current_database() AS database, current_user, session_user,
             rolsuper AS is_superuser, rolcreaterole, rolcreatedb, rolbypassrls
      FROM pg_roles
      WHERE rolname = current_user
    `);
    expect(result.rows[0]).toMatchObject({
      current_user: env.POSTGRES_APP_ROLE,
      session_user: env.POSTGRES_APP_ROLE,
      is_superuser: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolbypassrls: false,
    });

  });

  it('refuses startup for the owner role and accepts the actual app role', async () => {
    await expect(assertSafeRuntimeDatabase(appRole)).resolves.toBeUndefined();
    await expect(assertSafeRuntimeDatabase(ownerRole)).rejects.toThrow(/Unsafe database runtime identity/);
  });

  it('verifies ownership, privileges, triggers, indexes, and effective PUBLIC permissions', async () => {
    const catalog = await admin.raw(`
      SELECT
        (SELECT count(*) FROM pg_tables
         WHERE schemaname = 'public' AND tablename IN
           ('users','wallets','vaults','transactions','ledger_accounts','journal_entries','journal_lines')
           AND tableowner = ?) AS owned_tables,
        (SELECT count(*) FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND t.tgenabled = 'O'
           AND (t.tgname, c.relname) IN (
             ('journal_entries_append_only','journal_entries'),
             ('journal_lines_append_only','journal_lines'),
             ('journal_entries_must_balance','journal_entries'),
             ('journal_lines_must_balance','journal_lines'),
             ('ledger_accounts_relationship_valid','ledger_accounts'),
             ('transactions_relationship_valid','transactions'),
             ('wallets_owner_immutable','wallets'),
             ('vaults_owner_immutable','vaults'),
             ('journal_entries_reversal_target_valid','journal_entries'),
             ('journal_entries_user_ownership_valid','journal_entries'),
             ('journal_lines_user_ownership_valid','journal_lines')
           )) AS required_triggers,
        (SELECT count(*) FROM pg_indexes
         WHERE schemaname = 'public' AND indexname IN
           ('transactions_merchant_request_id_uq','transactions_checkout_request_id_uq',
            'transactions_receipt_number_uq','journal_entries_one_reversal_uq')) AS required_indexes,
        has_schema_privilege(?, 'public', 'CREATE') AS app_schema_create,
        has_database_privilege(?, current_database(), 'TEMPORARY') AS app_temp
    `, [env.POSTGRES_MIGRATION_ROLE, env.POSTGRES_APP_ROLE, env.POSTGRES_APP_ROLE]);
    expect(Number(catalog.rows[0].owned_tables)).toBe(7);
    expect(Number(catalog.rows[0].required_triggers)).toBe(11);
    expect(Number(catalog.rows[0].required_indexes)).toBe(4);
    expect(catalog.rows[0].app_schema_create).toBe(false);
    expect(catalog.rows[0].app_temp).toBe(false);

    const appPrivileges = await appRole.raw(`
      SELECT has_table_privilege(current_user, 'public.' || table_name, 'INSERT') AS can_insert
      FROM (VALUES ('users'), ('wallets'), ('vaults'), ('transactions'),
                   ('ledger_accounts'), ('journal_entries'), ('journal_lines')) AS t(table_name)
    `);
    expect(appPrivileges.rows.every((row: { can_insert: boolean }) => row.can_insert === false)).toBe(true);
  });

  it('rejects direct financial writes and privilege escalation as the runtime role', async () => {
    await expect(appRole.raw('CREATE SCHEMA phase1_attack')).rejects.toThrow();
    await expect(appRole.raw('CREATE FUNCTION public.phase1_attack() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$')).rejects.toThrow();
    await expect(appRole.raw('CREATE TABLE public.phase1_attack(id integer)')).rejects.toThrow();
    await expect(appRole.raw('INSERT INTO public.journal_entries(source_type, source_reference, description) VALUES (?, ?, ?)', [
      'attack', randomUUID(), 'must fail',
    ])).rejects.toThrow();
  });

  it('keeps identity writes behind the migration-owned registration function', async () => {
    const privileges = await appRole.raw(`
      SELECT
        has_table_privilege(current_user, 'public.user_profiles', 'SELECT') AS profile_select,
        has_table_privilege(current_user, 'public.user_profiles', 'INSERT') AS profile_insert,
        has_table_privilege(current_user, 'public.user_credentials', 'INSERT') AS credential_insert,
        has_function_privilege(current_user, 'public.register_identity_user(text,text,text)', 'EXECUTE') AS register_execute
    `);
    expect(privileges.rows[0]).toEqual({
      profile_select: true,
      profile_insert: false,
      credential_insert: false,
      register_execute: true,
    });
  });

  it('refuses destructive rollback while financial tables contain rows', async () => {
    await expect(initialDown(admin)).rejects.toThrow(/Refusing destructive rollback/);
  });

  it('requires a production CA unless system CA use is explicit', () => {
    const production = {
      NODE_ENV: 'production',
      POSTGRES_PASSWORD: 'password',
      POSTGRES_ADMIN_PASSWORD: 'password',
      POSTGRES_MIGRATION_PASSWORD: 'password',
      POSTGRES_APP_PASSWORD: 'password',
    };
    expect(() => parseEnvironment(production)).toThrow(/POSTGRES_CA_CERT/);
    expect(parseEnvironment({ ...production, POSTGRES_USE_SYSTEM_CA: 'true' }).NODE_ENV).toBe('production');
  });
});
