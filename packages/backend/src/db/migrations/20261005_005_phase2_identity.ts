import type { Knex } from 'knex';

const migrationRole = `"${(process.env.POSTGRES_MIGRATION_ROLE ?? 'pochi_langu_migration').replaceAll('"', '""')}"`;
const appRole = `"${(process.env.POSTGRES_APP_ROLE ?? 'pochi_langu_app').replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE user_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE user_credentials (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL CHECK (char_length(password_hash) BETWEEN 80 AND 255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE auth_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (revoked_at IS NULL OR revoked_at >= created_at)
    );
    CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id, expires_at);
    CREATE INDEX auth_sessions_active_idx
      ON auth_sessions (token_hash, expires_at)
      WHERE revoked_at IS NULL;

    CREATE OR REPLACE FUNCTION register_identity_user(
      phone_value TEXT,
      display_name_value TEXT,
      password_hash_value TEXT
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    DECLARE
      new_user_id UUID;
    BEGIN
      INSERT INTO users (phone_e164) VALUES (phone_value) RETURNING id INTO new_user_id;
      INSERT INTO user_profiles (user_id, display_name) VALUES (new_user_id, display_name_value);
      INSERT INTO user_credentials (user_id, password_hash) VALUES (new_user_id, password_hash_value);
      INSERT INTO wallets (user_id) VALUES (new_user_id);
      RETURN new_user_id;
    END;
    $$;

    ALTER TABLE user_profiles OWNER TO ${migrationRole};
    ALTER TABLE user_credentials OWNER TO ${migrationRole};
    ALTER TABLE auth_sessions OWNER TO ${migrationRole};
    ALTER FUNCTION register_identity_user(TEXT, TEXT, TEXT) OWNER TO ${migrationRole};

    REVOKE ALL ON user_profiles, user_credentials, auth_sessions FROM PUBLIC;
    GRANT SELECT, INSERT, UPDATE ON user_profiles, user_credentials, auth_sessions TO ${appRole};
    GRANT DELETE ON auth_sessions TO ${appRole};
    REVOKE ALL ON FUNCTION register_identity_user(TEXT, TEXT, TEXT) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION register_identity_user(TEXT, TEXT, TEXT) TO ${appRole};
  `);
}

export async function down(knex: Knex): Promise<void> {
  if (process.env.ALLOW_DESTRUCTIVE_NON_PRODUCTION_ROLLBACK !== 'true' || process.env.NODE_ENV === 'production') {
    const populated = await knex
      .raw(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('user_profiles', 'user_credentials', 'auth_sessions')
          AND EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = information_schema.tables.table_name
          )
      `)
      .then(async (result) => {
        const tables: string[] = [];
        for (const row of result.rows as Array<{ table_name: string }>) {
          const count = await knex(row.table_name).count<{ count: string }>({ count: '*' }).first();
          if (Number(count?.count ?? 0) > 0) tables.push(row.table_name);
        }
        return tables;
      });
    if (populated.length > 0) {
      throw new Error(`Refusing destructive rollback with populated identity tables: ${populated.join(', ')}`);
    }
  }

  await knex.raw(`
    DROP FUNCTION IF EXISTS register_identity_user(TEXT, TEXT, TEXT);
    DROP TABLE IF EXISTS auth_sessions;
    DROP TABLE IF EXISTS user_credentials;
    DROP TABLE IF EXISTS user_profiles;
  `);
}
