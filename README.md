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
