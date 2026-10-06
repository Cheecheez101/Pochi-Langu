import type { Knex } from 'knex';

const migrationRole = `"${(process.env.POSTGRES_MIGRATION_ROLE ?? 'pochi_langu_migration').replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
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
      WHERE transactions.id = current_deposit.transaction_id;

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
    ALTER FUNCTION apply_deposit_result(UUID, TEXT, deposit_status, INTEGER, TEXT, JSONB)
      OWNER TO ${migrationRole};
  `);
}

export async function down(_knex: Knex): Promise<void> {
  void _knex;
}
