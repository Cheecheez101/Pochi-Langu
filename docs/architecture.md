# Architecture overview

## Architectural direction

The platform is intentionally designed as a modular monolith rather than a distributed system. The backend exposes a versioned `/api/v1` API to be consumed by the React frontend while preserving clear domain boundaries for authentication, accounting, payments, user management, and savings goals.

## Runtime split

- Backend: Node.js + Express + TypeScript
- Frontend: React + Vite + TypeScript
- Database: PostgreSQL with Knex migrations
- Local development: Docker Compose for PostgreSQL

## Domain guardrails

- Money is represented in minor units using bigint-safe integer values.
- The journal ledger is the source of truth; wallet/vault/account balances are
  projections that must be reconciled from journal entries.
- Journal entries remain balanced and immutable.
- External payment flows are deferred until the accounting model is formalized.
- Security defaults include Helmet, CORS policy, API rate limiting, request IDs, and structured logging.

## Future domain boundaries

The application will eventually contain separate domain flows for:

- auth and profile management
- wallet and ledger operations
- savings goals and vaults
- M-Pesa/Safaricom payment orchestration
- payout and withdrawal processing
- reporting and reconciliation

These domain boundaries will be introduced only when the financial semantics are ready for implementation.
