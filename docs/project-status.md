# Project status

## Current phase

Phase 4: savings foundation is implemented on the Phase 3 wallet/deposit and
Phase 2 identity
boundary. Phase 1 financial core remediation and Phase 2 identity/frontend
foundation remain complete. M-Pesa remains prohibited.

## Scope currently included

- npm workspaces monorepo structure
- Node.js + TypeScript backend skeleton
- React + Vite TypeScript frontend shell
- baseline Express API and health route under `/api/v1`
- PostgreSQL configuration and Knex migration foundation
- append-only journal, state-transition, relationship, privilege, catalog, and
  committed concurrency controls
- environment validation and runtime configuration
- request ID, logging, and security middleware baseline
- local Docker foundation for PostgreSQL
- architecture and ADR documentation
- CI smoke workflow
- server-side identity sessions, role-aware authorization, and read-only admin
  operational routes
- responsive public, authenticated, and admin React application shell
- authenticated wallet balance and deposit history APIs and UX
- ledger-first Daraja sandbox deposit settlement and reconciliation event records
- Daraja sandbox STK Push initiation and callback processing
- savings goals, vault lock rules, internal ledger transfers, and progress UX

## Scope intentionally deferred

- M-Pesa payments and callbacks
- withdrawals
- M-Pesa provider execution
- production deployment or secrets management
- financial account creation business processes beyond the architectural guardrails

## Important guardrails

- KES only
- bigint minor units in TypeScript
- no floating-point money
- ledger as source of truth
- balanced immutable journal entries
- explicit state machines and reconciliation for external payment uncertainty

## Phase 1 remediation handoff

| ID | Description | Agent | Status | Evidence |
| --- | --- | --- | --- | --- |
| FIN-001 | Financial schema, append-only journal, state machines | Abacus | DONE | migration + integration tests |
| FIN-002 | Runtime role and effective PostgreSQL privileges | Sentinel/Pipeline | DONE | catalog and attack tests |
| FIN-003 | Cross-user relationship and reversal protection | Abacus/Probe | DONE | regression + concurrency tests |
| FIN-004 | Migration rollback and reapply | Pipeline | DONE | fresh PG16 migrate → rollback → migrate; ACL snapshot equivalent |
| FIN-005 | Reversal target and same-user journal ownership | Abacus | DONE | forward migrations `20261005_002` and `20261005_003` + regression tests |
| FIN-006 | Runtime identity startup guard | Sentinel | DONE | runtime database identity check + owner-role refusal test |
| FIN-007 | PostgreSQL 16 standardization and fresh catalog diff | Pipeline | DONE | ADR-007 + fresh PG16 catalog/evidence + independent audit |

**Phase 1 Status: PASS**

Database verification used database `pochi_langu`, migration role
`pochi_langu_migration` for schema/test setup, and runtime role
`pochi_langu_app` for runtime verification. The standardized Phase 1 listener
is host port `15432` and reports PostgreSQL 16. No M-Pesa functionality is
implemented.

## Independent gate audit

The 2026-10-05 independent audit used PostgreSQL 16.14 on
`localhost:15432`, database `pochi_langu`. The runtime role was verified as
non-superuser, non-owner, not a member of the migration owner role, without
`CREATE` on `public`, and without `TEMPORARY`; startup protection rejected the
superuser, direct owner, and owner-member identities. The independent hardening
rollback comparison changed the relevant ACLs during rollback and restored the
original ACL text after reapplication. A disposable PostgreSQL 16 database
completed migrate → rollback → migrate and restored the expected migration
catalog and financial objects.

The gate is **PASS**. No authoritative pre-remediation snapshot exists outside
the current repository, so migration `20261004_000_initial.ts` byte identity is
**NOT VERIFIABLE**; this historical limitation is explicitly recorded and was
not treated as reconstructed evidence.

The owner-authorized `npm audit fix --force` dependency changes remain in
place, including Vitest `5.0.3` and React Router DOM `7.18.4`. After the
changes, `npm install`, `npm audit`, tests, typecheck, lint, build, and
`git diff --check` were rerun; the dependency audit reported zero
vulnerabilities, backend tests reported 26 passing tests, and the frontend
test workspace had no test files.

The Docker development database uses admin role `pochi_langu` (not a
`postgres` role) on host port `15432`; the local environment was corrected to
use that identity. A new forward migration,
`20261005_004_phase1_temp_privilege_fix.ts`, is applied. Fresh-database
bootstrap evidence includes an administrative `pgcrypto` install and explicit
revocation of `TEMPORARY` from `PUBLIC` and `pochi_langu_app`; runtime probing
then reports `temporary_priv=false` and rejects temporary-table creation with
SQLSTATE `42501`.

The complete Docker attack matrix was rerun against a disposable PostgreSQL
16.14 database using `pochi_langu_app`. All direct financial mutation,
append-only, relationship, ownership, reversal, privilege-escalation, public
schema, trigger-bypass, and temporary-object attempts were rejected at the
runtime privilege boundary; the fixture state remained unchanged. Effective
ACL inspection confirmed the runtime role could not grant privileges to
another role. Committed reversal concurrency produced exactly one committed
reversal. Startup accepted the normal role and rejected superuser, owner, and
owner-member identities. Invalid credentials failed closed.

**Phase 4 savings foundation: IMPLEMENTED with internal ledger transfers only.
Daraja is sandbox-only; live-money payout functionality remains PROHIBITED.**
