import type { Knex } from 'knex';

const migrationRole = `"${(process.env.POSTGRES_MIGRATION_ROLE ?? 'pochi_langu_migration').replaceAll('"', '""')}"`;
const appRole = `"${(process.env.POSTGRES_APP_ROLE ?? 'pochi_langu_app').replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE deposits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id),
      user_id UUID NOT NULL REFERENCES users(id),
      wallet_id UUID NOT NULL REFERENCES wallets(id),
      amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
      currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
      phone_e164 TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'mock',
      provider_reference TEXT UNIQUE,
      status deposit_status NOT NULL DEFAULT 'pending',
      result_code INTEGER,
      result_description TEXT,
      journal_entry_id UUID UNIQUE REFERENCES journal_entries(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX deposits_user_created_idx ON deposits (user_id, created_at DESC);
    CREATE INDEX deposits_status_idx ON deposits (status, updated_at);

    CREATE TABLE deposit_reconciliation_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deposit_id UUID NOT NULL REFERENCES deposits(id),
      provider_reference TEXT,
      observed_status deposit_status NOT NULL,
      result_code INTEGER,
      result_description TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX deposit_reconciliation_events_deposit_idx
      ON deposit_reconciliation_events (deposit_id, created_at DESC);

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

    INSERT INTO ledger_accounts (id, account_type, currency)
    VALUES ('00000000-0000-0000-0000-000000000001', 'clearing', 'KES')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO ledger_accounts (account_type, user_id, wallet_id, currency)
    SELECT 'wallet', w.user_id, w.id, w.currency
    FROM wallets w
    WHERE NOT EXISTS (
      SELECT 1 FROM ledger_accounts a WHERE a.wallet_id = w.id
    );

    CREATE OR REPLACE FUNCTION create_pending_deposit(
      user_value UUID,
      amount_value BIGINT,
      phone_value TEXT,
      idempotency_value TEXT,
      provider_value TEXT
    )
    RETURNS TABLE (
      deposit_id UUID,
      transaction_id UUID,
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
      deposit_value UUID;
    BEGIN
      IF amount_value <= 0 THEN
        RAISE EXCEPTION 'Deposit amount must be positive';
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
        gen_random_uuid(), user_value, wallet_value, 'deposit', 'pending',
        amount_value, idempotency_value, provider_value
      )
      ON CONFLICT (user_id, idempotency_key) DO NOTHING
      RETURNING id INTO transaction_value;
      IF transaction_value IS NULL THEN
        SELECT t.id INTO transaction_value
        FROM transactions t
        WHERE t.user_id = user_value AND t.idempotency_key = idempotency_value
        FOR UPDATE;
        SELECT d.id, d.transaction_id, d.wallet_id, d.amount_minor, d.status
        INTO deposit_id, transaction_id, wallet_id, amount_minor, status
        FROM deposits d WHERE d.transaction_id = transaction_value;
        RETURN NEXT;
        RETURN;
      END IF;

      deposit_value := gen_random_uuid();
      INSERT INTO deposits (
        id, transaction_id, user_id, wallet_id, amount_minor, phone_e164, provider
      ) VALUES (
        deposit_value, transaction_value, user_value, wallet_value,
        amount_value, phone_value, provider_value
      );
      deposit_id := deposit_value;
      transaction_id := transaction_value;
      wallet_id := wallet_value;
      amount_minor := amount_value;
      status := 'pending';
      RETURN NEXT;
    END;
    $$;

    CREATE OR REPLACE FUNCTION apply_deposit_result(
      deposit_value UUID,
      provider_reference_value TEXT,
      next_status deposit_status,
      result_code_value INTEGER,
      result_description_value TEXT,
      payload_value JSONB
    )
    RETURNS TABLE (
      deposit_id UUID,
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
      current_deposit deposits%ROWTYPE;
      wallet_account UUID;
      clearing_account UUID := '00000000-0000-0000-0000-000000000001';
      entry_value UUID;
    BEGIN
      SELECT * INTO current_deposit FROM deposits WHERE id = deposit_value FOR UPDATE;
      IF current_deposit.id IS NULL THEN
        RAISE EXCEPTION 'Deposit not found';
      END IF;
      IF next_status NOT IN ('processing', 'succeeded', 'failed', 'requires_reconciliation', 'requires_review', 'cancelled') THEN
        RAISE EXCEPTION 'Unsupported deposit result status';
      END IF;
      IF current_deposit.status = 'succeeded' THEN
        IF next_status <> 'succeeded' OR current_deposit.provider_reference IS DISTINCT FROM provider_reference_value THEN
          RAISE EXCEPTION 'Succeeded deposit cannot be changed';
        END IF;
      ELSIF current_deposit.status IN ('failed', 'cancelled') THEN
        RAISE EXCEPTION 'Terminal deposit cannot be changed';
      END IF;

      IF next_status = 'succeeded' AND current_deposit.journal_entry_id IS NULL THEN
        SELECT a.id INTO wallet_account
        FROM ledger_accounts a
        WHERE a.wallet_id = current_deposit.wallet_id AND a.account_type = 'wallet'
        FOR UPDATE;
        IF wallet_account IS NULL THEN
          RAISE EXCEPTION 'Wallet ledger account not found';
        END IF;
        entry_value := gen_random_uuid();
        INSERT INTO journal_entries (
          id, entry_kind, source_type, source_reference, description
        ) VALUES (
          entry_value, 'original', 'deposit', current_deposit.id::text,
          'Daraja deposit ' || current_deposit.id::text
        );
        INSERT INTO journal_lines (journal_entry_id, ledger_account_id, debit_minor, credit_minor)
        VALUES
          (entry_value, wallet_account, current_deposit.amount_minor, 0),
          (entry_value, clearing_account, 0, current_deposit.amount_minor);
        UPDATE ledger_accounts SET balance_minor = balance_minor + current_deposit.amount_minor
          WHERE id = wallet_account;
        UPDATE wallets SET available_minor = available_minor + current_deposit.amount_minor,
          updated_at = now() WHERE id = current_deposit.wallet_id;
      END IF;

      IF next_status IN ('succeeded', 'failed', 'cancelled')
        AND EXISTS (
          SELECT 1 FROM transactions t
          WHERE t.id = current_deposit.transaction_id AND t.status = 'pending'
        ) THEN
        UPDATE transactions SET status = 'processing', updated_at = now()
          WHERE transactions.id = current_deposit.transaction_id;
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
      provider = current_deposit.provider,
      receipt_number = COALESCE(provider_reference_value, receipt_number),
      result_code = result_code_value,
      result_description = result_description_value,
      updated_at = now()
      WHERE id = current_deposit.transaction_id;

      UPDATE deposits
      SET status = next_status,
          provider_reference = COALESCE(provider_reference_value, deposits.provider_reference),
          result_code = result_code_value,
          result_description = result_description_value,
          journal_entry_id = COALESCE(entry_value, deposits.journal_entry_id),
          updated_at = now()
      WHERE deposits.id = current_deposit.id;

      INSERT INTO deposit_reconciliation_events (
        deposit_id, provider_reference, observed_status, result_code,
        result_description, payload
      ) VALUES (
        current_deposit.id, provider_reference_value, next_status,
        result_code_value, result_description_value, COALESCE(payload_value, '{}'::jsonb)
      );

      RETURN QUERY
      SELECT d.id, d.transaction_id, d.user_id, d.wallet_id, d.amount_minor,
        d.status, d.journal_entry_id
      FROM deposits d WHERE d.id = current_deposit.id;
    END;
    $$;

    ALTER TABLE deposits OWNER TO ${migrationRole};
    ALTER TABLE deposit_reconciliation_events OWNER TO ${migrationRole};
    ALTER FUNCTION create_pending_deposit(UUID, BIGINT, TEXT, TEXT, TEXT) OWNER TO ${migrationRole};
    ALTER FUNCTION apply_deposit_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB) OWNER TO ${migrationRole};

    REVOKE ALL ON deposits, deposit_reconciliation_events FROM PUBLIC;
    GRANT SELECT ON deposits, deposit_reconciliation_events TO ${appRole};
    REVOKE ALL ON FUNCTION create_pending_deposit(UUID, BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION apply_deposit_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION create_pending_deposit(UUID, BIGINT, TEXT, TEXT, TEXT) TO ${appRole};
    GRANT EXECUTE ON FUNCTION apply_deposit_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB) TO ${appRole};
  `);
}

export async function down(knex: Knex): Promise<void> {
  const count = await knex('deposits').count<{ count: string }>({ count: '*' }).first();
  if (Number(count?.count ?? 0) > 0) {
    throw new Error('Refusing destructive rollback with populated deposits');
  }
  await knex.raw(`
    DROP FUNCTION IF EXISTS apply_deposit_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB);
    DROP FUNCTION IF EXISTS create_pending_deposit(UUID, BIGINT, TEXT, TEXT, TEXT);
    DROP TRIGGER IF EXISTS wallets_ledger_account ON wallets;
    DROP FUNCTION IF EXISTS ensure_wallet_ledger_account();
    DROP TABLE IF EXISTS deposit_reconciliation_events;
    DROP TABLE IF EXISTS deposits;
  `);
}
