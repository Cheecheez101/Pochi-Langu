import type { Knex } from 'knex';

const migrationRole = `"${(process.env.POSTGRES_MIGRATION_ROLE ?? 'pochi_langu_migration').replaceAll('"', '""')}"`;
const appRole = `"${(process.env.POSTGRES_APP_ROLE ?? 'pochi_langu_app').replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE withdrawals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id),
      user_id UUID NOT NULL REFERENCES users(id),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
      provider TEXT NOT NULL DEFAULT 'daraja-sandbox',
      provider_reference TEXT UNIQUE,
      status deposit_status NOT NULL DEFAULT 'pending',
      result_code INTEGER,
      result_description TEXT,
      journal_entry_id UUID UNIQUE REFERENCES journal_entries(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX withdrawals_user_created_idx ON withdrawals (user_id, created_at DESC);
    CREATE INDEX withdrawals_status_idx ON withdrawals (status, updated_at);

    CREATE TABLE withdrawal_reconciliation_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      withdrawal_id UUID NOT NULL REFERENCES withdrawals(id),
      provider_reference TEXT,
      observed_status deposit_status NOT NULL,
      result_code INTEGER,
      result_description TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX withdrawal_reconciliation_events_withdrawal_idx
      ON withdrawal_reconciliation_events (withdrawal_id, created_at DESC);

    CREATE OR REPLACE FUNCTION ensure_wallet_ledger_account()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      INSERT INTO ledger_accounts (account_type, user_id, wallet_id, currency)
      VALUES ('wallet', NEW.user_id, NEW.id, NEW.currency)
      ON CONFLICT DO NOTHING;
      RETURN NEW;
    END;
    $$;
    ALTER FUNCTION ensure_wallet_ledger_account() OWNER TO ${migrationRole};
    DROP TRIGGER IF EXISTS wallets_ledger_account ON wallets;
    CREATE TRIGGER wallets_ledger_account
      AFTER INSERT ON wallets
      FOR EACH ROW EXECUTE FUNCTION ensure_wallet_ledger_account();
    REVOKE ALL ON FUNCTION ensure_wallet_ledger_account() FROM PUBLIC;

    CREATE OR REPLACE FUNCTION create_pending_withdrawal(
      user_value UUID, amount_value BIGINT, phone_value TEXT, reference_value TEXT, provider_value TEXT
    )
    RETURNS TABLE (
      withdrawal_id UUID,
      transaction_id UUID,
      user_id UUID,
      wallet_id UUID,
      amount_minor BIGINT,
      status deposit_status
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      wallet_value UUID;
      transaction_value UUID;
    BEGIN
      IF amount_value <= 0 THEN
        RAISE EXCEPTION 'Withdrawal amount must be positive';
      END IF;
      SELECT w.id INTO wallet_value
      FROM wallets w
      WHERE w.user_id = user_value AND w.status = 'active'
      FOR UPDATE;
      IF wallet_value IS NULL THEN
        RAISE EXCEPTION 'Active wallet not found';
      END IF;

      INSERT INTO transactions (
        id, user_id, wallet_id, type, status, amount_minor, idempotency_key, provider
      )
      VALUES (
        gen_random_uuid(), user_value, wallet_value, 'withdrawal', 'pending',
        amount_value, reference_value, provider_value
      )
      ON CONFLICT (user_id, reference_value) DO NOTHING
      RETURNING id INTO transaction_value;

      IF transaction_value IS NULL THEN
        SELECT t.id INTO transaction_value
        FROM transactions t
        WHERE t.user_id = user_value AND t.idempotency_key = reference_value
        FOR UPDATE;
      END IF;

      withdrawal_id := gen_random_uuid();
      INSERT INTO withdrawals (
        id, transaction_id, user_id, wallet_id, amount_minor, currency, provider
      ) VALUES (
        withdrawal_id, transaction_value, user_value, wallet_value,
        amount_value, 'KES', provider_value
      );
      transaction_id := transaction_value;
      wallet_id := wallet_value;
      amount_minor := amount_value;
      status := 'pending';
      RETURN NEXT;
    END;
    $$;

    CREATE OR REPLACE FUNCTION apply_withdrawal_result(
      withdrawal_value UUID,
      provider_reference_value TEXT,
      next_status deposit_status,
      result_code_value INTEGER,
      result_description_value TEXT,
      payload_value JSONB
    )
    RETURNS TABLE (
      withdrawal_id UUID,
      transaction_id UUID,
      user_id UUID,
      wallet_id UUID,
      amount_minor BIGINT,
      status deposit_status,
      journal_entry_id UUID
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      current_withdrawal withdrawals%ROWTYPE;
      wallet_account UUID;
      clearing_account UUID := '00000000-0000-0000-0000-000000000001';
      entry_value UUID;
    BEGIN
      SELECT * INTO current_withdrawal FROM withdrawals WHERE id = withdrawal_value FOR UPDATE;
      IF current_withdrawal.id IS NULL THEN
        RAISE EXCEPTION 'Withdrawal not found';
      END IF;
      IF next_status NOT IN ('processing', 'succeeded', 'failed', 'requires_reconciliation', 'requires_review', 'cancelled') THEN
        RAISE EXCEPTION 'Unsupported withdrawal result status';
      END IF;
      IF current_withdrawal.status = 'succeeded' THEN
        IF next_status <> 'succeeded' OR current_withdrawal.provider_reference IS DISTINCT FROM provider_reference_value THEN
          RAISE EXCEPTION 'Succeeded withdrawal cannot be changed';
        END IF;
      ELSIF current_withdrawal.status IN ('failed', 'cancelled') THEN
        RAISE EXCEPTION 'Terminal withdrawal cannot be changed';
      END IF;

      IF next_status = 'succeeded' AND current_withdrawal.journal_entry_id IS NULL THEN
        SELECT a.id INTO wallet_account
        FROM ledger_accounts a
        WHERE a.wallet_id = current_withdrawal.wallet_id AND a.account_type = 'wallet'
        FOR UPDATE;
        IF wallet_account IS NULL THEN
          RAISE EXCEPTION 'Wallet ledger account not found';
        END IF;
        entry_value := gen_random_uuid();
        INSERT INTO journal_entries (
          id, entry_kind, source_type, source_reference, description
        ) VALUES (
          entry_value, 'original', 'withdrawal', current_withdrawal.id::text,
          'M-Pesa withdrawal ' || current_withdrawal.id::text
        );
        INSERT INTO journal_lines (journal_entry_id, ledger_account_id, debit_minor, credit_minor)
        VALUES
          (entry_value, wallet_account, 0, current_withdrawal.amount_minor),
          (entry_value, clearing_account, current_withdrawal.amount_minor, 0);
        UPDATE ledger_accounts SET balance_minor = balance_minor - current_withdrawal.amount_minor
          WHERE id = wallet_account;
        UPDATE wallets SET available_minor = available_minor - current_withdrawal.amount_minor,
          updated_at = now() WHERE id = current_withdrawal.wallet_id;
      END IF;

      IF next_status IN ('succeeded', 'failed', 'cancelled')
        AND EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.id = current_withdrawal.transaction_id AND t.status = 'pending'
        ) THEN
        UPDATE transactions SET status = 'processing', updated_at = now()
          WHERE transactions.id = current_withdrawal.transaction_id;
      END IF;

      UPDATE transactions
      SET status = CASE
        WHEN next_status = 'processing' THEN 'processing'
        WHEN next_status = 'succeeded' THEN 'succeeded'
        WHEN next_status = 'requires_reconciliation' THEN 'requires_reconciliation'
        WHEN next_status = 'requires_review' THEN 'requires_review'
        WHEN next_status = 'cancelled' THEN 'cancelled'
        ELSE 'failed'
      END,
      provider = current_withdrawal.provider,
      receipt_number = COALESCE(provider_reference_value, receipt_number),
      result_code = result_code_value,
      result_description = result_description_value,
      updated_at = now()
      WHERE transactions.id = current_withdrawal.transaction_id;

      UPDATE withdrawals
      SET status = next_status,
          provider_reference = COALESCE(provider_reference_value, withdrawals.provider_reference),
          result_code = result_code_value,
          result_description = result_description_value,
          journal_entry_id = COALESCE(entry_value, withdrawals.journal_entry_id),
          updated_at = now()
      WHERE withdrawals.id = current_withdrawal.id;

      INSERT INTO withdrawal_reconciliation_events (
        withdrawal_id, provider_reference, observed_status, result_code,
        result_description, payload
      ) VALUES (
        current_withdrawal.id, provider_reference_value, next_status,
        result_code_value, result_description_value, COALESCE(payload_value, '{}'::jsonb)
      );

      RETURN QUERY
      SELECT w.id, w.transaction_id, w.user_id, w.wallet_id, w.amount_minor,
        w.status, w.journal_entry_id
      FROM withdrawals w WHERE w.id = current_withdrawal.id;
    END;
    $$;

    CREATE OR REPLACE FUNCTION reconcile_withdrawal(
      withdrawal_value UUID, provider_reference_value TEXT
    )
    RETURNS TABLE (
      withdrawal_id UUID,
      transaction_id UUID,
      user_id UUID,
      wallet_id UUID,
      amount_minor BIGINT,
      status deposit_status,
      journal_entry_id UUID
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      current_withdrawal withdrawals%ROWTYPE;
      wallet_account UUID;
      entry_value UUID;
    BEGIN
      SELECT * INTO current_withdrawal FROM withdrawals WHERE id = withdrawal_value FOR UPDATE;
      IF current_withdrawal.id IS NULL THEN
        RAISE EXCEPTION 'Withdrawal not found';
      END IF;
      IF current_withdrawal.status = 'succeeded' AND current_withdrawal.journal_entry_id IS NOT NULL THEN
        RETURN QUERY
        SELECT w.id, w.transaction_id, w.user_id, w.wallet_id, w.amount_minor,
          w.status, w.journal_entry_id
        FROM withdrawals w WHERE w.id = current_withdrawal.id;
      END IF;

      -- Look up the wallet ledger account (same pattern as apply_withdrawal_result)
      SELECT a.id INTO wallet_account
      FROM ledger_accounts a
      WHERE a.wallet_id = current_withdrawal.wallet_id AND a.account_type = 'wallet'
      FOR UPDATE;
      IF wallet_account IS NULL THEN
        RAISE EXCEPTION 'Wallet ledger account not found';
      END IF;

      entry_value := gen_random_uuid();
      INSERT INTO journal_entries (
        id, entry_kind, source_type, source_reference, description
      ) VALUES (
        entry_value, 'original', 'withdrawal_reconciliation', current_withdrawal.id::text,
        'M-Pesa withdrawal reconciliation ' || current_withdrawal.id::text
      );
      INSERT INTO journal_lines (journal_entry_id, ledger_account_id, debit_minor, credit_minor)
      VALUES
        (entry_value, wallet_account, 0, current_withdrawal.amount_minor),
        (entry_value, clearing_account, current_withdrawal.amount_minor, 0);
      UPDATE ledger_accounts SET balance_minor = balance_minor - current_withdrawal.amount_minor
        WHERE id = wallet_account;
      UPDATE wallets SET available_minor = available_minor - current_withdrawal.amount_minor,
        updated_at = now() WHERE id = current_withdrawal.wallet_id;

      UPDATE withdrawals
      SET status = 'succeeded',
          provider_reference = COALESCE(provider_reference_value, withdrawals.provider_reference),
          journal_entry_id = entry_value,
          updated_at = now()
      WHERE withdrawals.id = current_withdrawal.id;

      INSERT INTO withdrawal_reconciliation_events (
        withdrawal_id, provider_reference, observed_status, result_code,
        result_description, payload
      ) VALUES (
        current_withdrawal.id, provider_reference_value, 'succeeded',
        0, 'Reconciled via receipt number', '{}'::jsonb
      );

      RETURN QUERY
      SELECT w.id, w.transaction_id, w.user_id, w.wallet_id, w.amount_minor,
        w.status, w.journal_entry_id
      FROM withdrawals w WHERE w.id = current_withdrawal.id;
    END;
    $$;

    ALTER TABLE withdrawals OWNER TO ${migrationRole};
    ALTER TABLE withdrawal_reconciliation_events OWNER TO ${migrationRole};
    ALTER FUNCTION create_pending_withdrawal(UUID, BIGINT, TEXT, TEXT, TEXT) OWNER TO ${migrationRole};
    ALTER FUNCTION apply_withdrawal_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB) OWNER TO ${migrationRole};
    ALTER FUNCTION reconcile_withdrawal(UUID, TEXT) OWNER TO ${migrationRole};

    REVOKE ALL ON withdrawals, withdrawal_reconciliation_events FROM PUBLIC;
    GRANT SELECT ON withdrawals, withdrawal_reconciliation_events TO ${appRole};
    REVOKE ALL ON FUNCTION create_pending_withdrawal(UUID, BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION apply_withdrawal_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB) FROM PUBLIC;
    REVOKE ALL ON FUNCTION reconcile_withdrawal(UUID, TEXT) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION create_pending_withdrawal(UUID, BIGINT, TEXT, TEXT, TEXT) TO ${appRole};
    GRANT EXECUTE ON FUNCTION apply_withdrawal_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB) TO ${appRole};
    GRANT EXECUTE ON FUNCTION reconcile_withdrawal(UUID, TEXT) TO ${appRole};
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP FUNCTION IF EXISTS reconcile_withdrawal(UUID, TEXT);
    DROP FUNCTION IF EXISTS apply_withdrawal_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB);
    DROP FUNCTION IF EXISTS create_pending_withdrawal(UUID, BIGINT, TEXT, TEXT, TEXT);
    DROP TRIGGER IF EXISTS wallets_ledger_account ON wallets;
    DROP TABLE IF EXISTS withdrawal_reconciliation_events;
    DROP TABLE IF EXISTS withdrawals;
  `);
}