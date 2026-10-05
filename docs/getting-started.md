# Getting started

Start PostgreSQL with Docker:

Set credentials in the shell (do not commit them), then start PostgreSQL 16 on
host port `15432`:

```powershell
$env:POSTGRES_ADMIN_PASSWORD = 'use-a-local-secret'
$env:POSTGRES_PASSWORD = $env:POSTGRES_ADMIN_PASSWORD
$env:POSTGRES_MIGRATION_PASSWORD = 'use-a-different-local-secret'
$env:POSTGRES_APP_PASSWORD = 'use-another-local-secret'
$env:POSTGRES_PORT = '15432'
docker compose up -d postgres
```

The compose service publishes PostgreSQL on host port `15432` to avoid conflict
with an unrelated local PostgreSQL instance on `5432`. Set
`POSTGRES_PORT=15432` for migration and integration-test commands.

Provision the roles before the first migration. The admin password and both
role passwords come only from environment/configuration; the provisioning
script never logs them:

```powershell
$env:POSTGRES_HOST = 'localhost'
$env:POSTGRES_PORT = '15432'
$env:POSTGRES_DB = 'pochi_langu'
$env:POSTGRES_USER = 'pochi_langu'
npm run provision:roles
npm run migrate
```

For a fresh disposable database, the administrative bootstrap must also create
`pgcrypto`, grant the migration role temporary access for migration execution,
and revoke `TEMPORARY` from both `PUBLIC` and `pochi_langu_app`. The application
role must never receive temporary-object access through the default `PUBLIC`
database privilege.

`pochi_langu_migration` owns schema objects and `pochi_langu_app` is the
runtime role. The application role has read-only access to Phase 1 financial
tables: it cannot insert or mutate users, wallets, vaults, transactions,
ledger accounts, journal entries, journal lines, or schema objects. Phase 1
financial posting remains fail-closed behind the migration-owned domain
boundary until a controlled posting procedure is introduced.

Run the database-backed tests locally with the same dedicated database:

```powershell
$env:NODE_ENV = 'test'
$env:POSTGRES_HOST = 'localhost'
$env:POSTGRES_PORT = '15432'
$env:POSTGRES_DB = 'pochi_langu'
$env:POSTGRES_USER = 'pochi_langu'
npm run test --workspace @pochi-langu/backend -- src/__tests__/database.integration.test.ts src/__tests__/financial.property.test.ts
```

The Phase 1 catalog and committed-concurrency checks are included in the
backend suite. They connect to `pochi_langu_app` independently of the
migration-role test connection and verify the effective PostgreSQL boundary.
