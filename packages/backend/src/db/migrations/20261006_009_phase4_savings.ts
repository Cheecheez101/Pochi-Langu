import type { Knex } from 'knex';

const migrationRole = `"${(process.env.POSTGRES_MIGRATION_ROLE ?? 'pochi_langu_migration').replaceAll('"', '""')}"`;
const appRole = `"${(process.env.POSTGRES_APP_ROLE ?? 'pochi_langu_app').replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE vaults ADD COLUMN IF NOT EXISTS lock_until TIMESTAMPTZ;
    ALTER TABLE vaults ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE vaults ADD CONSTRAINT vault_lock_until_valid CHECK (lock_until IS NULL OR lock_until >= created_at);

    CREATE OR REPLACE FUNCTION ensure_vault_ledger_account()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, public AS $$
    BEGIN
      INSERT INTO ledger_accounts (account_type, user_id, vault_id, currency)
      VALUES ('vault', NEW.user_id, NEW.id, NEW.currency)
      ON CONFLICT DO NOTHING;
      RETURN NEW;
    END;
    $$;
    ALTER FUNCTION ensure_vault_ledger_account() OWNER TO ${migrationRole};
    DROP TRIGGER IF EXISTS vaults_ledger_account ON vaults;
    CREATE TRIGGER vaults_ledger_account AFTER INSERT ON vaults
      FOR EACH ROW EXECUTE FUNCTION ensure_vault_ledger_account();
    REVOKE ALL ON FUNCTION ensure_vault_ledger_account() FROM PUBLIC;

    INSERT INTO ledger_accounts (account_type, user_id, vault_id, currency)
    SELECT 'vault', v.user_id, v.id, v.currency
    FROM vaults v
    WHERE NOT EXISTS (SELECT 1 FROM ledger_accounts a WHERE a.vault_id = v.id);

    CREATE OR REPLACE FUNCTION create_savings_goal(
      user_value UUID, name_value TEXT, description_value TEXT,
      target_value BIGINT, lock_until_value TIMESTAMPTZ
    )
    RETURNS TABLE (vault_id UUID, name TEXT, description TEXT, target_minor BIGINT,
      balance_minor BIGINT, status vault_status, lock_until TIMESTAMPTZ)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    DECLARE created_vault UUID;
    BEGIN
      IF target_value <= 0 THEN RAISE EXCEPTION 'Savings target must be positive'; END IF;
      IF lock_until_value IS NOT NULL AND lock_until_value <= now() THEN
        RAISE EXCEPTION 'Savings lock must be in the future';
      END IF;
      INSERT INTO vaults (user_id, name, description, target_minor, lock_until)
      VALUES (user_value, name_value, COALESCE(description_value, ''), target_value, lock_until_value)
      RETURNING id INTO created_vault;
      RETURN QUERY SELECT v.id, v.name, v.description, v.target_minor, v.balance_minor,
        v.status, v.lock_until FROM vaults v WHERE v.id = created_vault;
    END;
    $$;

    CREATE OR REPLACE FUNCTION transfer_wallet_to_vault(
      user_value UUID, vault_value UUID, amount_value BIGINT, reference_value TEXT
    ) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, public AS $$
    DECLARE wallet_value UUID; wallet_account UUID; vault_account UUID; entry_value UUID;
    BEGIN
      IF amount_value <= 0 THEN RAISE EXCEPTION 'Savings transfer must be positive'; END IF;
      SELECT id INTO wallet_value FROM wallets WHERE user_id = user_value AND status = 'active' FOR UPDATE;
      SELECT v.id INTO vault_value FROM vaults v WHERE v.id = vault_value AND v.user_id = user_value AND v.status = 'active' FOR UPDATE;
      IF wallet_value IS NULL OR vault_value IS NULL THEN RAISE EXCEPTION 'Active wallet or savings goal not found'; END IF;
      SELECT id INTO wallet_account FROM ledger_accounts WHERE wallet_id = wallet_value;
      SELECT id INTO vault_account FROM ledger_accounts WHERE vault_id = vault_value;
      IF (SELECT available_minor FROM wallets WHERE id = wallet_value) < amount_value THEN
        RAISE EXCEPTION 'Transfer would overdraw the wallet';
      END IF;
      entry_value := gen_random_uuid();
      INSERT INTO journal_entries (id, entry_kind, source_type, source_reference, description)
      VALUES (entry_value, 'original', 'savings_transfer', reference_value, 'Wallet to savings goal');
      INSERT INTO journal_lines (journal_entry_id, ledger_account_id, debit_minor, credit_minor)
      VALUES (entry_value, vault_account, amount_value, 0), (entry_value, wallet_account, 0, amount_value);
      UPDATE ledger_accounts SET balance_minor = balance_minor - amount_value WHERE id = wallet_account;
      UPDATE ledger_accounts SET balance_minor = balance_minor + amount_value WHERE id = vault_account;
      UPDATE wallets SET available_minor = available_minor - amount_value, updated_at = now() WHERE id = wallet_value;
      UPDATE vaults SET balance_minor = balance_minor + amount_value, updated_at = now() WHERE id = vault_value;
      RETURN entry_value;
    END;
    $$;

    CREATE OR REPLACE FUNCTION transfer_vault_to_wallet(
      user_value UUID, vault_value UUID, amount_value BIGINT, reference_value TEXT
    ) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = pg_catalog, public AS $$
    DECLARE wallet_value UUID; wallet_account UUID; vault_account UUID; entry_value UUID;
    BEGIN
      IF amount_value <= 0 THEN RAISE EXCEPTION 'Savings transfer must be positive'; END IF;
      SELECT id INTO wallet_value FROM wallets WHERE user_id = user_value AND status = 'active' FOR UPDATE;
      SELECT v.id INTO vault_value FROM vaults v WHERE v.id = vault_value AND v.user_id = user_value
        AND v.status = 'unlocked' AND (v.lock_until IS NULL OR v.lock_until <= now()) FOR UPDATE;
      IF wallet_value IS NULL OR vault_value IS NULL THEN
        RAISE EXCEPTION 'Savings goal is still locked or unavailable';
      END IF;
      SELECT id INTO wallet_account FROM ledger_accounts WHERE wallet_id = wallet_value;
      SELECT id INTO vault_account FROM ledger_accounts WHERE vault_id = vault_value;
      IF (SELECT balance_minor FROM vaults WHERE id = vault_value) < amount_value THEN
        RAISE EXCEPTION 'Transfer would overdraw the savings goal';
      END IF;
      entry_value := gen_random_uuid();
      INSERT INTO journal_entries (id, entry_kind, source_type, source_reference, description)
      VALUES (entry_value, 'original', 'savings_transfer', reference_value, 'Savings goal to wallet');
      INSERT INTO journal_lines (journal_entry_id, ledger_account_id, debit_minor, credit_minor)
      VALUES (entry_value, wallet_account, amount_value, 0), (entry_value, vault_account, 0, amount_value);
      UPDATE ledger_accounts SET balance_minor = balance_minor - amount_value WHERE id = vault_account;
      UPDATE ledger_accounts SET balance_minor = balance_minor + amount_value WHERE id = wallet_account;
      UPDATE wallets SET available_minor = available_minor + amount_value, updated_at = now() WHERE id = wallet_value;
      UPDATE vaults SET balance_minor = balance_minor - amount_value, updated_at = now() WHERE id = vault_value;
      RETURN entry_value;
    END;
    $$;

    ALTER FUNCTION create_savings_goal(UUID, TEXT, TEXT, BIGINT, TIMESTAMPTZ) OWNER TO ${migrationRole};
    ALTER FUNCTION transfer_wallet_to_vault(UUID, UUID, BIGINT, TEXT) OWNER TO ${migrationRole};
    ALTER FUNCTION transfer_vault_to_wallet(UUID, UUID, BIGINT, TEXT) OWNER TO ${migrationRole};
    ALTER TABLE vaults OWNER TO ${migrationRole};
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON vaults FROM ${appRole};
    GRANT SELECT ON vaults TO ${appRole};
    GRANT EXECUTE ON FUNCTION create_savings_goal(UUID, TEXT, TEXT, BIGINT, TIMESTAMPTZ) TO ${appRole};
    GRANT EXECUTE ON FUNCTION transfer_wallet_to_vault(UUID, UUID, BIGINT, TEXT) TO ${appRole};
    GRANT EXECUTE ON FUNCTION transfer_vault_to_wallet(UUID, UUID, BIGINT, TEXT) TO ${appRole};
  `);
}

export async function down(knex: Knex): Promise<void> {
  const count = await knex('vaults').count<{ count: string }>({ count: '*' }).first();
  if (Number(count?.count ?? 0) > 0) throw new Error('Refusing destructive rollback with populated savings goals');
  await knex.raw(`
    DROP FUNCTION IF EXISTS transfer_vault_to_wallet(UUID, UUID, BIGINT, TEXT);
    DROP FUNCTION IF EXISTS transfer_wallet_to_vault(UUID, UUID, BIGINT, TEXT);
    DROP FUNCTION IF EXISTS create_savings_goal(UUID, TEXT, TEXT, BIGINT, TIMESTAMPTZ);
    DROP TRIGGER IF EXISTS vaults_ledger_account ON vaults;
    DROP FUNCTION IF EXISTS ensure_vault_ledger_account();
    ALTER TABLE vaults DROP CONSTRAINT IF EXISTS vault_lock_until_valid;
    ALTER TABLE vaults DROP COLUMN IF EXISTS lock_until;
    ALTER TABLE vaults DROP COLUMN IF EXISTS description;
  `);
}
