# ADR-007: PostgreSQL 16 Phase 1 runtime and database boundary

Status: Accepted for Phase 1 remediation.

Development, test, and CI verification use the PostgreSQL 16 listener exposed
on host port `15432`. A locally reachable PostgreSQL listener on another port
or version is not Phase 1 evidence.

The normal application runtime uses `pochi_langu_app`. Startup must query the
effective PostgreSQL identity and refuse to serve if the role is a superuser,
owns a Phase 1 financial table, or is a member of the migration/owner role.
Migrations and catalog setup use `pochi_langu_migration`.

Every database evidence record includes `host:port`, `SHOW server_version`,
database, login user, `current_user`, `session_user`, `is_superuser`, and the
migration version. Fresh PostgreSQL 16 rebuilds and live migration state are
verified separately.
