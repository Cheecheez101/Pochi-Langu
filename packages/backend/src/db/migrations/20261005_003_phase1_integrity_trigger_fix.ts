import type { Knex } from 'knex';
import { env } from '../../config/env.js';

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;
const migrationRole = quoteIdentifier(env.POSTGRES_MIGRATION_ROLE);

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_journal_entry_user_ownership(entry_id UUID)
    RETURNS void
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      owned_user_count INTEGER;
    BEGIN
      SELECT count(DISTINCT a.user_id)::INTEGER
      INTO owned_user_count
      FROM journal_lines l
      JOIN ledger_accounts a ON a.id = l.ledger_account_id
      WHERE l.journal_entry_id = entry_id
        AND a.user_id IS NOT NULL;
      IF owned_user_count > 1 THEN
        RAISE EXCEPTION 'journal entry cannot mix user-owned ledger accounts';
      END IF;
    END;
    $$;

    CREATE OR REPLACE FUNCTION validate_journal_entry_user_ownership_entry()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      PERFORM validate_journal_entry_user_ownership(NEW.id);
      RETURN NEW;
    END;
    $$;

    CREATE OR REPLACE FUNCTION validate_journal_entry_user_ownership_line()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      PERFORM validate_journal_entry_user_ownership(NEW.journal_entry_id);
      RETURN NEW;
    END;
    $$;

    ALTER FUNCTION validate_journal_entry_user_ownership(UUID) OWNER TO ${migrationRole};
    ALTER FUNCTION validate_journal_entry_user_ownership_entry() OWNER TO ${migrationRole};
    ALTER FUNCTION validate_journal_entry_user_ownership_line() OWNER TO ${migrationRole};
    DROP TRIGGER IF EXISTS journal_entries_user_ownership_valid ON journal_entries;
    DROP TRIGGER IF EXISTS journal_lines_user_ownership_valid ON journal_lines;
    CREATE CONSTRAINT TRIGGER journal_entries_user_ownership_valid
      AFTER INSERT ON journal_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_user_ownership_entry();
    CREATE CONSTRAINT TRIGGER journal_lines_user_ownership_valid
      AFTER INSERT ON journal_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_user_ownership_line();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS journal_entries_user_ownership_valid ON journal_entries;
    DROP TRIGGER IF EXISTS journal_lines_user_ownership_valid ON journal_lines;
    DROP FUNCTION IF EXISTS validate_journal_entry_user_ownership_entry();
    DROP FUNCTION IF EXISTS validate_journal_entry_user_ownership_line();
    DROP FUNCTION IF EXISTS validate_journal_entry_user_ownership(UUID);
  `);
}
