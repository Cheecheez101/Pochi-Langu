import 'dotenv/config';
import pg from 'pg';
import { env } from '../src/config/env.js';

const { Client } = pg;

async function provision(): Promise<void> {
  const client = new Client({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_ADMIN_USER,
    password: env.POSTGRES_ADMIN_PASSWORD,
    ssl: env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true, ca: env.POSTGRES_CA_CERT }
      : false,
  });

  await client.connect();
  try {
    for (const role of [
      { name: env.POSTGRES_MIGRATION_ROLE, password: env.POSTGRES_MIGRATION_PASSWORD },
      { name: env.POSTGRES_APP_ROLE, password: env.POSTGRES_APP_PASSWORD },
    ]) {
      const roleResult = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role.name]);
      const roleIdentifier = pgEscapeIdentifier(role.name);
      const passwordLiteral = `'${role.password.replaceAll("'", "''")}'`;
      if (roleResult.rowCount === 0) {
        await client.query(`CREATE ROLE ${roleIdentifier} LOGIN PASSWORD ${passwordLiteral}`);
      } else {
        await client.query(`ALTER ROLE ${roleIdentifier} LOGIN PASSWORD ${passwordLiteral}`);
      }
    }
    const databaseResult = await client.query('SELECT current_database() AS name');
    await client.query(
      `GRANT CREATE ON DATABASE ${pgEscapeIdentifier(databaseResult.rows[0].name)} TO ${pgEscapeIdentifier(env.POSTGRES_MIGRATION_ROLE)}`,
    );
    await client.query(
      `GRANT USAGE, CREATE ON SCHEMA public TO ${pgEscapeIdentifier(env.POSTGRES_MIGRATION_ROLE)}`,
    );
    await client.query(
      `REVOKE TEMPORARY ON DATABASE ${pgEscapeIdentifier(databaseResult.rows[0].name)} FROM PUBLIC`,
    );
    await client.query(
      `GRANT TEMPORARY ON DATABASE ${pgEscapeIdentifier(databaseResult.rows[0].name)} TO ${pgEscapeIdentifier(env.POSTGRES_MIGRATION_ROLE)} WITH GRANT OPTION`,
    );
  } finally {
    await client.end();
  }
}

function pgEscapeIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

provision().catch(() => {
  console.error('Database role provisioning failed');
  process.exitCode = 1;
});
