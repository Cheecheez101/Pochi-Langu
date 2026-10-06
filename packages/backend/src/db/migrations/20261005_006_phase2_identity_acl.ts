import type { Knex } from 'knex';

const appRole = `"${(process.env.POSTGRES_APP_ROLE ?? 'pochi_langu_app').replaceAll('"', '""')}"`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON user_profiles, user_credentials FROM ${appRole};
    GRANT SELECT ON user_profiles, user_credentials TO ${appRole};
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    REVOKE ALL ON user_profiles, user_credentials FROM ${appRole};
    GRANT SELECT, INSERT, UPDATE ON user_profiles, user_credentials TO ${appRole};
  `);
}
