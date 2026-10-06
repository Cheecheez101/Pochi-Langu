import type { Knex } from 'knex';

const migrationRole = `"${(process.env.POSTGRES_MIGRATION_ROLE ?? 'pochi_langu_migration').replaceAll('"', '""')}"`;
const appRole = `"${(process.env.POSTGRES_APP_ROLE ?? 'pochi_langu_app').replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE deposits ALTER COLUMN provider SET DEFAULT 'daraja';

    CREATE OR REPLACE FUNCTION register_deposit_provider(
      deposit_value UUID,
      provider_value TEXT,
      merchant_request_value TEXT,
      checkout_request_value TEXT
    )
    RETURNS VOID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      UPDATE deposits
      SET provider = provider_value,
          provider_reference = checkout_request_value,
          updated_at = now()
      WHERE id = deposit_value AND status = 'pending';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending deposit not found';
      END IF;
      UPDATE transactions
      SET provider = provider_value,
          merchant_request_id = merchant_request_value,
          checkout_request_id = checkout_request_value,
          updated_at = now()
      WHERE id = (SELECT transaction_id FROM deposits WHERE id = deposit_value);
    END;
    $$;
    ALTER FUNCTION register_deposit_provider(UUID, TEXT, TEXT, TEXT) OWNER TO ${migrationRole};
    REVOKE ALL ON FUNCTION register_deposit_provider(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION register_deposit_provider(UUID, TEXT, TEXT, TEXT) TO ${appRole};
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP FUNCTION IF EXISTS register_deposit_provider(UUID, TEXT, TEXT, TEXT);
    ALTER TABLE deposits ALTER COLUMN provider SET DEFAULT 'mock';
  `);
}
