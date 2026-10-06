import type { Knex } from 'knex';

const migrationRole = `"${(process.env.POSTGRES_MIGRATION_ROLE ?? 'pochi_langu_migration').replaceAll('"', '""')}"`;
const appRole = `"${(process.env.POSTGRES_APP_ROLE ?? 'pochi_langu_app').replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TYPE identity_role AS ENUM ('user', 'admin');

    CREATE TABLE user_roles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role identity_role NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION assign_default_identity_role()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $$
    BEGIN
      INSERT INTO user_roles (user_id) VALUES (NEW.id);
      RETURN NEW;
    END;
    $$;

    ALTER TABLE user_roles OWNER TO ${migrationRole};
    ALTER FUNCTION assign_default_identity_role() OWNER TO ${migrationRole};
    CREATE TRIGGER users_default_identity_role
      AFTER INSERT ON users
      FOR EACH ROW EXECUTE FUNCTION assign_default_identity_role();

    REVOKE ALL ON user_roles FROM PUBLIC;
    GRANT SELECT ON user_roles TO ${appRole};
    REVOKE ALL ON FUNCTION assign_default_identity_role() FROM PUBLIC;
  `);
}

export async function down(knex: Knex): Promise<void> {
  const populated = await knex('user_roles').count<{ count: string }>({ count: '*' }).first();
  if (Number(populated?.count ?? 0) > 0) {
    throw new Error('Refusing destructive rollback with populated identity roles');
  }
  await knex.raw(`
    DROP TRIGGER IF EXISTS users_default_identity_role ON users;
    DROP FUNCTION IF EXISTS assign_default_identity_role();
    DROP TABLE IF EXISTS user_roles;
    DROP TYPE IF EXISTS identity_role;
  `);
}
