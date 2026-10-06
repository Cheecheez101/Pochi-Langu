# AGENTS.md — Pochi Langu

## Repository structure
- **Monorepo**: npm workspaces (`packages/*`)
  - `@pochi-langu/backend` — Express + TypeScript API on port 4000
  - `@pochi-langu/frontend` — React + Vite + TypeScript on port 5173
- `Langu/` — empty leftover directory, ignore
- Config at root: `package.json`, `eslint.config.js`, `.env`, `docker-compose.yml`

## Key commands (run from repo root)
```
npm install                    # install all workspaces
npm run dev                    # starts backend (tsx watch) only
npm run build                  # builds both packages (backend then frontend)
npm run lint                   # eslint both packages (max-warnings 0)
npm run typecheck              # tsc --noEmit both packages
npm run test                   # vitest both packages
npm run test:e2e               # Playwright e2e (frontend only)
npm run migrate                # knex migrate:latest (uses migration role)
npm run migrate:rollback       # knex migrate:rollback
npm run provision:roles        # creates migration + app roles (run before first migrate)
```

### Single-package commands (prefix with `--workspace @pochi-langu/backend` or `--workspace @pochi-langu/frontend`)
```
npm run dev     # backend: tsx watch src/index.ts  |  frontend: vite --host 0.0.0.0
npm run build   # backend: tsc -p tsconfig.json   |  frontend: tsc -b && vite build
npm run typecheck
npm run lint
npm run test
```

## Environment & database
- `.env` loaded from **repo root** (see `packages/backend/src/config/env.ts:6`)
- Required env: `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_MIGRATION_PASSWORD`, `POSTGRES_APP_PASSWORD`
- PostgreSQL runs on **host port 15432** (Docker compose, not 5432)
- Two roles: `pochi_langu_migration` (owns schema), `pochi_langu_app` (runtime, read-only on financial tables)
- **Order**: `provision:roles` → `migrate` → `dev` / `test`
- Runtime identity guard in `src/config/database.ts:60` rejects superuser, owner, owner-member, or any owned financial tables

## Financial guardrails (non-negotiable)
- KES only
- `bigint` minor units in TypeScript (see `src/domain/money.ts`)
- No floating-point money
- Ledger = source of truth; projections derived from ledger
- Balanced immutable journal entries
- Explicit state machines + reconciliation for external payment uncertainty
- **M-Pesa live money, B2C, withdrawals prohibited** (Daraja sandbox only)

## Testing
- Backend: vitest, env `NODE_ENV=test`, tests in `src/__tests__/`
  - Run specific: `npm run test --workspace @pochi-langu/backend -- src/__tests__/database.integration.test.ts`
- Frontend: vitest (unit) + Playwright (e2e in `e2e/`)
- CI order: `provision:roles` → `migrate` → `typecheck` → `test` → `build` → `npm audit --audit-level=high`

## Frontend dev server
- Vite on port 5173, proxies `/api` → `http://localhost:4000`
- CORS origin configured in `.env` (`CORS_ORIGIN`)

## Migrations
- Knex with TypeScript, files in `packages/backend/src/db/migrations/`
- Migration config: `packages/backend/src/db/knexfile.ts` (uses migration role credentials)
- Always run `provision:roles` on fresh DB before `migrate`

## Entry points
- Backend: `packages/backend/src/index.ts` → `app.ts` (Express setup, routes under `/api/v1`)
- Frontend: `packages/frontend/src/main.tsx` → `App.tsx` (React Router, auth context)

## Linting / TypeScript
- ESLint flat config at root (`eslint.config.js`), extends `typescript-eslint.configs.recommended`
- Rule: `@typescript-eslint/no-explicit-any: error`
- `tsconfig.json` per package, `tsc --noEmit` for typecheck

## Architecture docs
- `docs/architecture.md` — system architecture
- `docs/project-status.md` — current phase, guardrails, audit evidence
- `docs/getting-started.md` — local DB bootstrap steps (PowerShell)
- `docs/decisions/` — ADRs for financial/accounting decisions (0001–0007)

## Common gotchas
- `.env` must be at repo root, not package root (dotenv path goes up 4 dirs from `src/config/env.ts`)
- PostgreSQL port is 15432 (not 5432) to avoid local instance conflicts
- `provision:roles` uses admin credentials (`POSTGRES_ADMIN_*`), not app/migration creds
- Runtime role `pochi_langu_app` cannot create/mutate financial tables; migrations own schema
- Frontend has no test files yet; `test:e2e` requires backend running