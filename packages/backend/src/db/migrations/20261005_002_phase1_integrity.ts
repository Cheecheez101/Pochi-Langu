import type { Knex } from 'knex';
import { env } from '../../config/env.js';

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;
const migrationRole = quoteIdentifier(env.POSTGRES_MIGRATION_ROLE);

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_reversal_target()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      target_kind journal_entry_kind;
    BEGIN
      IF NEW.entry_kind = 'reversal' AND NEW.reversal_of_entry_id IS NULL THEN
        RAISE EXCEPTION 'reversal entries must identify a target entry';
      END IF;
      IF NEW.reversal_of_entry_id IS NOT NULL THEN
        SELECT entry_kind INTO target_kind
        FROM journal_entries
        WHERE id = NEW.reversal_of_entry_id;
        IF target_kind IS NULL THEN
          RAISE EXCEPTION 'reversal target entry does not exist';
        END IF;
        IF target_kind = 'reversal' THEN
          RAISE EXCEPTION 'a reversal cannot target another reversal';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;
    ALTER FUNCTION validate_reversal_target() OWNER TO ${migrationRole};
    DROP TRIGGER IF EXISTS journal_entries_reversal_target_valid ON journal_entries;
    CREATE TRIGGER journal_entries_reversal_target_valid
      BEFORE INSERT OR UPDATE OF entry_kind, reversal_of_entry_id
      ON journal_entries
      FOR EACH ROW EXECUTE FUNCTION validate_reversal_target();

    CREATE OR REPLACE FUNCTION validate_journal_entry_user_ownership()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      entry_id UUID;
      owned_user_count INTEGER;
    BEGIN
      entry_id := CASE
        WHEN TG_TABLE_NAME = 'journal_entries' THEN NEW.id
        ELSE NEW.journal_entry_id
      END;
      SELECT count(DISTINCT a.user_id)::INTEGER
      INTO owned_user_count
      FROM journal_lines l
      JOIN ledger_accounts a ON a.id = l.ledger_account_id
      WHERE l.journal_entry_id = entry_id
        AND a.user_id IS NOT NULL;
      IF owned_user_count > 1 THEN
        RAISE EXCEPTION 'journal entry cannot mix user-owned ledger accounts';
      END IF;
      RETURN NEW;
    END;
    $$;
    ALTER FUNCTION validate_journal_entry_user_ownership() OWNER TO ${migrationRole};
    DROP TRIGGER IF EXISTS journal_entries_user_ownership_valid ON journal_entries;
    CREATE CONSTRAINT TRIGGER journal_entries_user_ownership_valid
      AFTER INSERT ON journal_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_user_ownership();
    DROP TRIGGER IF EXISTS journal_lines_user_ownership_valid ON journal_lines;
    CREATE CONSTRAINT TRIGGER journal_lines_user_ownership_valid
      AFTER INSERT ON journal_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_user_ownership();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS journal_entries_reversal_target_valid ON journal_entries;
    DROP TRIGGER IF EXISTS journal_entries_user_ownership_valid ON journal_entries;
    DROP TRIGGER IF EXISTS journal_lines_user_ownership_valid ON journal_lines;
    DROP FUNCTION IF EXISTS validate_reversal_target();
    DROP FUNCTION IF EXISTS validate_journal_entry_user_ownership();
  `);
}
