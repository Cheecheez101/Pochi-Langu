# Plan: Integrate M-Pesa Daraja Sandbox & Remove Mock Payment Paths

## Context
The codebase already uses `DarajaSandboxProvider` as the sole payment provider (no mock exists). The `/sandbox-callback` endpoint doesn't exist. The only callback is `/api/v1/deposits/callback` which processes real Daraja callbacks.

**Current state verified:**
- `payment-provider.ts`: Only `DarajaSandboxProvider` implementation, exported as `paymentProvider`
- `deposits.ts`: Single callback endpoint `/api/v1/deposits/callback` using `paymentProvider.parseCallback()`
- Migration 013: Changed deposits table default provider from `'mock'` → `'daraja'`
- `deposit.ts`: `createDeposit()` calls `paymentProvider.initiateDeposit()` → real Daraja STK Push

## Tasks

### 1. Update test using 'mock' provider → use 'daraja'
**File:** `packages/backend/src/__tests__/database.integration.test.ts`
- Line 274: Change `'mock'` to `'daraja'` in `create_pending_deposit` call for "settles a deposit result once" test

### 2. Add duplicate callback idempotency test
**File:** `packages/backend/src/__tests__/database.integration.test.ts`
- Add test: "duplicate Daraja callbacks remain idempotent"
- Verify: calling `apply_deposit_result` twice with same `provider_reference` produces single journal entry

### 3. Run validation suite
```
npm run test --workspace @pochi-langu/backend
npm run test
npm run typecheck
npm run lint
npm run build
git diff --check
```

### 4. Verify no mock payment paths remain
- Search codebase for: `mock`, `sandbox-callback`, `MockPaymentProvider`
- Confirm zero results in production code paths

## Acceptance Criteria
- [ ] All backend tests pass
- [ ] Full `npm test` passes (both packages)
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (max-warnings 0)
- [ ] `npm run build` passes
- [ ] `git diff --check` passes
- [ ] No mock/sandbox-callback references in production code
- [ ] Tests verify: pending → no auto-settlement → real callback settles → duplicate callbacks idempotent

## Risk Assessment
- Low risk: Only test file changes, no production logic modifications
- The Daraja provider is already the production path
- Migration 013 already flipped default to 'daraja'