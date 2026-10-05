import type { Knex } from 'knex';
import { env } from '../../config/env.js';

const migrationRole = `"${env.POSTGRES_MIGRATION_ROLE.replaceAll('"', '""')}"`;
const appRole = `"${env.POSTGRES_APP_ROLE.replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    DO $$
    BEGIN
      CREATE TYPE user_status AS ENUM ('active', 'suspended', 'closed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE wallet_status AS ENUM ('active', 'frozen', 'closed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE vault_status AS ENUM ('active', 'unlocked', 'broken', 'closed');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE transaction_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'transfer');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE deposit_status AS ENUM (
        'pending', 'processing', 'succeeded', 'failed',
        'requires_reconciliation', 'requires_review', 'cancelled'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE withdrawal_status AS ENUM (
        'pending', 'processing', 'succeeded', 'failed', 'cancelled'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE transfer_status AS ENUM (
        'pending', 'processing', 'succeeded', 'failed', 'cancelled'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE early_withdrawal_policy AS ENUM ('blocked', 'penalty');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE ledger_account_type AS ENUM ('wallet', 'vault', 'clearing', 'fee', 'suspense');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$
    BEGIN
      CREATE TYPE journal_entry_kind AS ENUM ('original', 'reversal', 'adjustment');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_e164 TEXT NOT NULL UNIQUE,
      status user_status NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id),
      currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
      available_minor BIGINT NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
      locked_minor BIGINT NOT NULL DEFAULT 0 CHECK (locked_minor >= 0),
      pending_minor BIGINT NOT NULL DEFAULT 0 CHECK (pending_minor >= 0),
      status wallet_status NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE vaults (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
      target_minor BIGINT NOT NULL CHECK (target_minor >= 0),
      balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
      status vault_status NOT NULL DEFAULT 'active',
      early_withdrawal_policy early_withdrawal_policy NOT NULL DEFAULT 'blocked',
      penalty_rate_bps BIGINT CHECK (penalty_rate_bps IS NULL OR penalty_rate_bps >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, name)
    );

    CREATE TABLE transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      vault_id UUID REFERENCES vaults(id),
      type transaction_type NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      idempotency_key TEXT NOT NULL,
      provider TEXT,
      merchant_request_id TEXT,
      checkout_request_id TEXT,
      receipt_number TEXT,
      result_code INTEGER,
      result_description TEXT,
      CHECK (
        (type = 'deposit' AND status IN (
          'pending', 'processing', 'succeeded', 'failed',
          'requires_reconciliation', 'requires_review', 'cancelled'
        ))
        OR (type = 'withdrawal' AND status IN (
          'pending', 'processing', 'succeeded', 'failed', 'cancelled'
        ))
        OR (type = 'transfer' AND status IN (
          'pending', 'processing', 'succeeded', 'failed', 'cancelled'
        ))
      ),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, idempotency_key)
    );

    CREATE UNIQUE INDEX transactions_merchant_request_id_uq
      ON transactions (merchant_request_id)
      WHERE merchant_request_id IS NOT NULL;
    CREATE UNIQUE INDEX transactions_checkout_request_id_uq
      ON transactions (checkout_request_id)
      WHERE checkout_request_id IS NOT NULL;
    CREATE UNIQUE INDEX transactions_receipt_number_uq
      ON transactions (receipt_number)
      WHERE receipt_number IS NOT NULL;
    CREATE INDEX transactions_user_status_idx ON transactions (user_id, status);
    CREATE INDEX transactions_wallet_created_idx ON transactions (wallet_id, created_at);

    CREATE TABLE transaction_status_transitions (
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      PRIMARY KEY (from_status, to_status),
      CHECK (from_status <> to_status)
    );
    INSERT INTO transaction_status_transitions (from_status, to_status) VALUES
      ('pending', 'processing'),
      ('pending', 'failed'),
      ('pending', 'cancelled'),
      ('processing', 'succeeded'),
      ('processing', 'failed'),
      ('processing', 'cancelled'),
      ('processing', 'requires_reconciliation'),
      ('processing', 'requires_review'),
      ('requires_reconciliation', 'requires_review'),
      ('requires_review', 'succeeded'),
      ('requires_review', 'failed');

    CREATE TABLE vault_status_transitions (
      from_status vault_status NOT NULL,
      to_status vault_status NOT NULL,
      PRIMARY KEY (from_status, to_status),
      CHECK (from_status <> to_status)
    );
    INSERT INTO vault_status_transitions (from_status, to_status) VALUES
      ('active', 'unlocked'),
      ('unlocked', 'closed'),
      ('active', 'broken');

    CREATE TABLE ledger_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_type ledger_account_type NOT NULL,
      user_id UUID REFERENCES users(id),
      wallet_id UUID REFERENCES wallets(id),
      vault_id UUID REFERENCES vaults(id),
      currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
      balance_minor BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(wallet_id, vault_id) <= 1)
    );
    CREATE INDEX ledger_accounts_user_idx ON ledger_accounts (user_id);
    CREATE INDEX ledger_accounts_wallet_idx ON ledger_accounts (wallet_id);
    CREATE INDEX ledger_accounts_vault_idx ON ledger_accounts (vault_id);

    CREATE TABLE journal_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entry_kind journal_entry_kind NOT NULL DEFAULT 'original',
      source_type TEXT NOT NULL,
      source_reference TEXT NOT NULL,
      reversal_of_entry_id UUID REFERENCES journal_entries(id),
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source_type, source_reference)
    );
    CREATE INDEX journal_entries_source_idx ON journal_entries (source_type, source_reference);
    CREATE UNIQUE INDEX journal_entries_one_reversal_uq
      ON journal_entries (reversal_of_entry_id)
      WHERE reversal_of_entry_id IS NOT NULL;

    CREATE TABLE journal_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
      ledger_account_id UUID NOT NULL REFERENCES ledger_accounts(id),
      currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
      debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
      credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))
    );
    CREATE INDEX journal_lines_entry_idx ON journal_lines (journal_entry_id);
    CREATE INDEX journal_lines_account_idx ON journal_lines (ledger_account_id);

    CREATE OR REPLACE FUNCTION reject_financial_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'financial records are append-only; use a reversal or adjustment entry';
    END;
    $$;

    CREATE OR REPLACE FUNCTION validate_journal_line_account()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      account_currency TEXT;
      account_type_value ledger_account_type;
      wallet_state wallet_status;
      vault_state vault_status;
    BEGIN
      SELECT a.currency, a.account_type INTO account_currency, account_type_value
      FROM ledger_accounts a WHERE a.id = NEW.ledger_account_id;
      IF account_currency IS NULL THEN
        RAISE EXCEPTION 'journal line references an unknown ledger account';
      END IF;
      IF NEW.currency <> account_currency THEN
        RAISE EXCEPTION 'journal line currency must match ledger account currency';
      END IF;
      SELECT w.status INTO wallet_state
      FROM ledger_accounts a JOIN wallets w ON w.id = a.wallet_id
      WHERE a.id = NEW.ledger_account_id;
      IF wallet_state IS NOT NULL AND wallet_state = 'closed' THEN
        RAISE EXCEPTION 'journal line cannot reference a closed wallet';
      END IF;
      SELECT v.status INTO vault_state
      FROM ledger_accounts a JOIN vaults v ON v.id = a.vault_id
      WHERE a.id = NEW.ledger_account_id;
      IF vault_state IS NOT NULL AND vault_state = 'closed' THEN
        RAISE EXCEPTION 'journal line cannot reference a closed vault';
      END IF;
      IF account_type_value = 'wallet' AND NOT EXISTS (
        SELECT 1 FROM ledger_accounts WHERE id = NEW.ledger_account_id AND wallet_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'wallet ledger account must reference a wallet';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER journal_lines_account_valid
      BEFORE INSERT ON journal_lines
      FOR EACH ROW EXECUTE FUNCTION validate_journal_line_account();

    CREATE TRIGGER journal_entries_append_only
      BEFORE UPDATE OR DELETE ON journal_entries
      FOR EACH ROW EXECUTE FUNCTION reject_financial_mutation();
    CREATE TRIGGER journal_entries_no_truncate
      BEFORE TRUNCATE ON journal_entries
      FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();
    CREATE TRIGGER journal_lines_append_only
      BEFORE UPDATE OR DELETE ON journal_lines
      FOR EACH ROW EXECUTE FUNCTION reject_financial_mutation();
    CREATE TRIGGER journal_lines_no_truncate
      BEFORE TRUNCATE ON journal_lines
      FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_mutation();

    CREATE OR REPLACE FUNCTION validate_transaction_transition()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.status <> OLD.status AND NOT EXISTS (
        SELECT 1
        FROM transaction_status_transitions
        WHERE from_status = OLD.status AND to_status = NEW.status
      ) THEN
        RAISE EXCEPTION 'invalid transaction status transition: % -> %', OLD.status, NEW.status;
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER transactions_status_transition
      BEFORE UPDATE OF status ON transactions
      FOR EACH ROW EXECUTE FUNCTION validate_transaction_transition();

    CREATE OR REPLACE FUNCTION validate_vault_transition()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.status <> OLD.status AND NOT EXISTS (
        SELECT 1
        FROM vault_status_transitions
        WHERE from_status = OLD.status AND to_status = NEW.status
      ) THEN
        RAISE EXCEPTION 'invalid vault status transition: % -> %', OLD.status, NEW.status;
      END IF;
      IF OLD.status = 'active' AND NEW.status = 'broken'
        AND OLD.early_withdrawal_policy <> 'penalty' THEN
        RAISE EXCEPTION 'vault can only become broken under the penalty policy';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER vault_status_transition
      BEFORE UPDATE OF status ON vaults
      FOR EACH ROW EXECUTE FUNCTION validate_vault_transition();

    CREATE OR REPLACE FUNCTION prevent_vault_policy_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.early_withdrawal_policy <> OLD.early_withdrawal_policy
        OR NEW.penalty_rate_bps IS DISTINCT FROM OLD.penalty_rate_bps THEN
        RAISE EXCEPTION 'vault withdrawal policy is immutable';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER vault_policy_immutable
      BEFORE UPDATE OF early_withdrawal_policy, penalty_rate_bps ON vaults
      FOR EACH ROW EXECUTE FUNCTION prevent_vault_policy_mutation();

    CREATE OR REPLACE FUNCTION validate_journal_entry_balance()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      entry_id UUID;
      debit_total BIGINT;
      credit_total BIGINT;
      line_count INTEGER;
    BEGIN
      entry_id := NEW.id;
      IF TG_TABLE_NAME = 'journal_lines' THEN
        entry_id := NEW.journal_entry_id;
      END IF;
      SELECT COUNT(*)::INTEGER, COALESCE(SUM(debit_minor), 0), COALESCE(SUM(credit_minor), 0)
        INTO line_count, debit_total, credit_total
        FROM journal_lines
        WHERE journal_entry_id = entry_id;
      IF line_count < 2 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'journal entry % must have at least two balanced lines', entry_id;
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE CONSTRAINT TRIGGER journal_entries_must_balance
      AFTER INSERT ON journal_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_balance();
    CREATE CONSTRAINT TRIGGER journal_lines_must_balance
      AFTER INSERT ON journal_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_balance();

    ALTER TABLE users OWNER TO ${migrationRole};
    ALTER TABLE wallets OWNER TO ${migrationRole};
    ALTER TABLE vaults OWNER TO ${migrationRole};
    ALTER TABLE transactions OWNER TO ${migrationRole};
    ALTER TABLE ledger_accounts OWNER TO ${migrationRole};
    ALTER TABLE journal_entries OWNER TO ${migrationRole};
    ALTER TABLE journal_lines OWNER TO ${migrationRole};
    ALTER TABLE transaction_status_transitions OWNER TO ${migrationRole};
    ALTER TABLE vault_status_transitions OWNER TO ${migrationRole};
    ALTER FUNCTION reject_financial_mutation() OWNER TO ${migrationRole};
    ALTER FUNCTION validate_transaction_transition() OWNER TO ${migrationRole};
    ALTER FUNCTION validate_vault_transition() OWNER TO ${migrationRole};
    ALTER FUNCTION prevent_vault_policy_mutation() OWNER TO ${migrationRole};
    ALTER FUNCTION validate_journal_entry_balance() OWNER TO ${migrationRole};
    ALTER FUNCTION validate_journal_line_account() OWNER TO ${migrationRole};

    REVOKE ALL ON users, wallets, vaults, transactions, ledger_accounts,
      journal_entries, journal_lines, transaction_status_transitions,
      vault_status_transitions FROM PUBLIC;
    GRANT SELECT, INSERT ON users, wallets, vaults, transactions TO ${appRole};
    REVOKE INSERT ON ledger_accounts, journal_entries, journal_lines FROM ${appRole};
    GRANT SELECT ON transaction_status_transitions, vault_status_transitions TO ${appRole};
    REVOKE UPDATE, DELETE, TRUNCATE ON wallets, vaults, ledger_accounts FROM ${appRole};
    REVOKE UPDATE, DELETE, TRUNCATE ON journal_entries, journal_lines FROM ${appRole};
    REVOKE CREATE ON SCHEMA public FROM ${appRole};
    DO $$
    BEGIN
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM %I', current_database(), '${env.POSTGRES_APP_ROLE.replaceAll("'", "''")}');
    END $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  if (!env.ALLOW_DESTRUCTIVE_NON_PRODUCTION_ROLLBACK || env.NODE_ENV === 'production') {
    const tables = [
      'users',
      'wallets',
      'vaults',
      'transactions',
      'ledger_accounts',
      'journal_entries',
      'journal_lines',
    ];
    const populated = [];
    for (const table of tables) {
      const result = await knex(table).count<{ count: string }>({ count: '*' }).first();
      if (Number(result?.count ?? 0) > 0) populated.push(table);
    }
    if (populated.length > 0) {
      throw new Error(
        `Refusing destructive rollback with populated financial tables: ${populated.join(', ')}`,
      );
    }
  }
  await knex.raw(`
    DROP TABLE IF EXISTS journal_lines;
    DROP TABLE IF EXISTS journal_entries;
    DROP FUNCTION IF EXISTS validate_journal_line_account() CASCADE;
    DROP TABLE IF EXISTS ledger_accounts;
    DROP TABLE IF EXISTS transaction_status_transitions;
    DROP TABLE IF EXISTS vault_status_transitions;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS vaults;
    DROP TABLE IF EXISTS wallets;
    DROP TABLE IF EXISTS users;
    DROP TYPE IF EXISTS journal_entry_kind;
    DROP TYPE IF EXISTS ledger_account_type;
    DROP TYPE IF EXISTS transaction_type;
    DROP TYPE IF EXISTS transaction_status;
    DROP TYPE IF EXISTS transfer_status;
    DROP TYPE IF EXISTS withdrawal_status;
    DROP TYPE IF EXISTS deposit_status;
    DROP TYPE IF EXISTS early_withdrawal_policy;
    DROP TYPE IF EXISTS vault_status;
    DROP TYPE IF EXISTS wallet_status;
    DROP TYPE IF EXISTS user_status;
    DROP FUNCTION IF EXISTS reject_financial_mutation() CASCADE;
    DROP FUNCTION IF EXISTS validate_transaction_transition() CASCADE;
    DROP FUNCTION IF EXISTS validate_vault_transition() CASCADE;
    DROP FUNCTION IF EXISTS prevent_vault_policy_mutation() CASCADE;
    DROP FUNCTION IF EXISTS validate_journal_entry_balance() CASCADE;
  `);
}
