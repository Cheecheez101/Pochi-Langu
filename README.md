# Pochi Langu

Pochi Langu is a Kenya-first savings and financial-discipline platform built as a modular monolith. This repository is intentionally scaffolded to provide a secure, production-minded foundation before any financial workflows are implemented.

## Phase 1 financial core

This repository currently establishes the safe baseline required for the platform:

- npm workspace monorepo structure
- Node.js + TypeScript backend and React + Vite frontend
- Express `/api/v1` API shell with request-id, logging, and security middleware
- PostgreSQL configuration and Knex migration setup
- append-only journal and explicit state-transition enforcement
- restricted runtime role with catalog-level privilege tests
- relationship, reversal, and committed concurrency regression tests
- environment validation for app configuration
- testing, linting, type-checking, and build scripts
- Docker local development foundation
- architecture and ADR documentation for key financial/accounting decisions

## Financial guardrails

The platform is intentionally constrained to the following rules from the project brief:

- KES only
- bigint minor units in TypeScript
- no floating-point money
- ledger as the source of truth
- balanced immutable journal entries
- projections derived from the ledger
- PostgreSQL transactional integrity
- explicit state machines and reconciliation for external payment uncertainty

Any financial flows beyond the foundation are intentionally deferred.

## Phase 2 identity and frontend foundation

Phase 2 adds a server-side session identity foundation and the first usable
React application shell:

- Kenyan phone registration and login with backend validation
- scrypt password hashing and opaque HttpOnly cookie sessions
- logout and protected current-user endpoint
- one-to-one identity profile/credential tables without duplicating financial ownership
- responsive landing, registration, login, and protected dashboard screens
- typed centralized frontend API client and authentication context
- backend-enforced regular-user/admin route boundaries with read-only admin
  operational views

Verification and recovery are not yet implemented. The dashboard uses explicit
empty states and does not invent balances, transactions, or savings activity.

M-Pesa, Daraja, STK Push, callbacks, B2C, withdrawals, and real-money testing
remain prohibited.

## Phase 3 wallet and deposits

Phase 3 adds verified wallet reads, deposit records, ledger-first deposit
settlement, explicit deposit reconciliation events, and a Daraja sandbox
provider boundary. A deposit remains pending after STK Push initiation and is
not added to the wallet projection until the real Daraja callback is applied as
`succeeded` through the accounting function. The frontend uses the same
authenticated API boundary to show wallet balances and deposit history.

The provider is restricted to the Daraja sandbox. Live-money M-Pesa, B2C,
withdrawals, and real-money production execution remain prohibited.

## Phase 4 savings

Phase 4 adds savings goals backed by the existing vault and ledger model.
Wallet-to-vault and unlocked-vault-to-wallet movements are balanced internal
ledger transfers. Goal progress is read from vault projections and no fees,
penalties, taxes, or other financial semantics are invented.

## Local development

```bash
npm install
npm run dev
```

The backend runs on port 4000 by default and exposes `/api/v1/health`. The frontend runs through the Vite dev server on the default Vite port.

## Status

See `docs/project-status.md` for the current project status and phase tracking.
Phase 1 is verified; identity, public financial APIs, and M-Pesa remain
deferred.
