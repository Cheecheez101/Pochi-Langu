import type { Knex } from 'knex';
import { env } from '../../config/env.js';

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;
const migrationRole = quoteIdentifier(env.POSTGRES_MIGRATION_ROLE);
const appRole = quoteIdentifier(env.POSTGRES_APP_ROLE);
const appRoleLiteral = env.POSTGRES_APP_ROLE.replaceAll("'", "''");

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION validate_ledger_account_relationship()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      related_user_id UUID;
    BEGIN
      IF NEW.account_type = 'wallet' AND (NEW.wallet_id IS NULL OR NEW.vault_id IS NOT NULL) THEN
        RAISE EXCEPTION 'wallet ledger accounts must reference exactly one wallet';
      END IF;
      IF NEW.account_type = 'vault' AND (NEW.vault_id IS NULL OR NEW.wallet_id IS NOT NULL) THEN
        RAISE EXCEPTION 'vault ledger accounts must reference exactly one vault';
      END IF;
      IF NEW.account_type IN ('clearing', 'fee', 'suspense')
        AND (NEW.wallet_id IS NOT NULL OR NEW.vault_id IS NOT NULL) THEN
        RAISE EXCEPTION 'clearing, fee, and suspense accounts cannot reference wallets or vaults';
      END IF;

      IF NEW.wallet_id IS NOT NULL THEN
        SELECT w.user_id INTO related_user_id FROM wallets w WHERE w.id = NEW.wallet_id;
      ELSIF NEW.vault_id IS NOT NULL THEN
        SELECT v.user_id INTO related_user_id FROM vaults v WHERE v.id = NEW.vault_id;
      END IF;
      IF (NEW.wallet_id IS NOT NULL OR NEW.vault_id IS NOT NULL)
        AND (related_user_id IS NULL OR NEW.user_id IS DISTINCT FROM related_user_id) THEN
        RAISE EXCEPTION 'ledger account user must match its wallet or vault';
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS ledger_accounts_relationship_valid ON ledger_accounts;
    CREATE TRIGGER ledger_accounts_relationship_valid
      BEFORE INSERT OR UPDATE OF account_type, user_id, wallet_id, vault_id
      ON ledger_accounts
      FOR EACH ROW EXECUTE FUNCTION validate_ledger_account_relationship();

    CREATE OR REPLACE FUNCTION validate_transaction_relationship()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM wallets w
        WHERE w.id = NEW.wallet_id AND w.user_id = NEW.user_id
      ) THEN
        RAISE EXCEPTION 'transaction wallet must belong to transaction user';
      END IF;
      IF NEW.vault_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM vaults v
        WHERE v.id = NEW.vault_id AND v.user_id = NEW.user_id
      ) THEN
        RAISE EXCEPTION 'transaction vault must belong to transaction user';
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE OR REPLACE FUNCTION prevent_parent_owner_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      IF TG_TABLE_NAME = 'wallets' AND EXISTS (
        SELECT 1 FROM ledger_accounts WHERE wallet_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'wallet ownership cannot change after ledger account creation';
      END IF;
      IF TG_TABLE_NAME = 'vaults' AND EXISTS (
        SELECT 1 FROM ledger_accounts WHERE vault_id = OLD.id
      ) THEN
        RAISE EXCEPTION 'vault ownership cannot change after ledger account creation';
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS transactions_relationship_valid ON transactions;
    CREATE TRIGGER transactions_relationship_valid
      BEFORE INSERT OR UPDATE OF user_id, wallet_id, vault_id
      ON transactions
      FOR EACH ROW EXECUTE FUNCTION validate_transaction_relationship();
    DROP TRIGGER IF EXISTS wallets_owner_immutable ON wallets;
    CREATE TRIGGER wallets_owner_immutable
      BEFORE UPDATE OF user_id ON wallets
      FOR EACH ROW EXECUTE FUNCTION prevent_parent_owner_mutation();
    DROP TRIGGER IF EXISTS vaults_owner_immutable ON vaults;
    CREATE TRIGGER vaults_owner_immutable
      BEFORE UPDATE OF user_id ON vaults
      FOR EACH ROW EXECUTE FUNCTION prevent_parent_owner_mutation();

    ALTER FUNCTION reject_financial_mutation() SET search_path = pg_catalog, public;
    ALTER FUNCTION validate_transaction_transition() SET search_path = pg_catalog, public;
    ALTER FUNCTION validate_vault_transition() SET search_path = pg_catalog, public;
    ALTER FUNCTION prevent_vault_policy_mutation() SET search_path = pg_catalog, public;
    ALTER FUNCTION validate_journal_entry_balance() SET search_path = pg_catalog, public;
    ALTER FUNCTION validate_journal_line_account() SET search_path = pg_catalog, public;
    ALTER FUNCTION validate_ledger_account_relationship() OWNER TO ${migrationRole};
    ALTER FUNCTION validate_transaction_relationship() OWNER TO ${migrationRole};
    ALTER FUNCTION prevent_parent_owner_mutation() OWNER TO ${migrationRole};

    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON users, wallets, vaults, transactions,
      ledger_accounts, journal_entries, journal_lines,
      transaction_status_transitions, vault_status_transitions FROM ${appRole};
    GRANT SELECT ON users, wallets, vaults, transactions, ledger_accounts,
      journal_entries, journal_lines, transaction_status_transitions,
      vault_status_transitions TO ${appRole};
    DO $$
    BEGIN
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM ${appRoleLiteral}', current_database());
    END $$;
    REVOKE CREATE ON SCHEMA public FROM ${appRole};
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TRIGGER IF EXISTS transactions_relationship_valid ON transactions;
    DROP TRIGGER IF EXISTS wallets_owner_immutable ON wallets;
    DROP TRIGGER IF EXISTS vaults_owner_immutable ON vaults;
    DROP TRIGGER IF EXISTS ledger_accounts_relationship_valid ON ledger_accounts;
    DROP FUNCTION IF EXISTS validate_transaction_relationship();
    DROP FUNCTION IF EXISTS prevent_parent_owner_mutation();
    DROP FUNCTION IF EXISTS validate_ledger_account_relationship();

    REVOKE ALL ON users, wallets, vaults, transactions, ledger_accounts,
      journal_entries, journal_lines, transaction_status_transitions,
      vault_status_transitions FROM ${appRole};
    GRANT SELECT, INSERT ON users, wallets, vaults, transactions TO ${appRole};
    GRANT SELECT ON transaction_status_transitions, vault_status_transitions TO ${appRole};
    GRANT USAGE, CREATE ON SCHEMA public TO ${migrationRole};
    DO $$
    BEGIN
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM ${appRoleLiteral}', current_database());
    END $$;
    GRANT CREATE ON SCHEMA public TO PUBLIC;
    REVOKE CREATE ON SCHEMA public FROM ${appRole};
  `);
}
