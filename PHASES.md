# Pochi Langu Implementation Plan

## Overview

Pochi Langu is a Kenyan money-discipline system that happens to move money. The financial infrastructure (Layer 1) is strong. This plan implements Layers 2-3 (financial intelligence + behavioral experience) across 9 phases.

## Current State

### Layer 1: Financial Infrastructure (COMPLETE)
- PostgreSQL with append-only journal ledger (source of truth)
- KES-only, bigint minor units
- Wallets with available/locked/pending balances (projections from ledger)
- Vaults (savings goals) with status machine: ACTIVE → UNLOCKED → CLOSED, ACTIVE → BROKEN
- Ledger transfers between wallet and vaults (ledger-backed, atomic, idempotent)
- M-Pesa Daraja sandbox: STK push, callback parsing, deposit lifecycle
- Runtime role security (pochi_langu_app cannot mutate financial tables directly)

### Layer 2-3: Financial Intelligence + Behavioral Experience (TO BUILD)

## Phase 2: Money Movement (IN PROGRESS)

### Goal
Complete Phase 2 acceptance: a user can put money in, see it in their wallet, recover a missing M-Pesa deposit through reconciliation, withdraw money out, and every successful money movement is represented exactly once in the ledger.

### Current State
- Deposits: STK push initiation ✓, callback parsing ✓, deposit → ledger → wallet ✓, idempotent callbacks ✓
- Withdrawals: NOT IMPLEMENTED
- Reconciliation for missing transactions: NOT IMPLEMENTED
- Daraja transaction query (for reconciliation): NOT IMPLEMENTED

### Tasks

1. **Withdrawal flow** (`packages/backend/src/domain/withdrawal.ts`)
   - New table `withdrawals` (similar to `deposits`)
   - New table `withdrawal_reconciliation_events`
   - B2C request → Daraja API → callback handling → ledger → wallet debit
   - Status machine: pending → processing → succeeded/failed
   - **Note**: Production constraint — M-Pesa B2C withdrawals are PROHIBITED per guardrails. Use sandbox B2C or simulate via test infrastructure. See `docs/project-status.md:39`.

2. **Reconciliation for missing transactions**
   - New domain `packages/backend/src/domain/reconciliation.ts`
   - API endpoint: `GET /api/v1/deposits/reconcile/:transactionCode`
   - Queries Daraja API for transaction status by transaction code/receipt number
   - Matches to existing deposit by provider reference
   - If found succeeded but wallet not credited: posts ledger entry idempotently
   - If not found locally: can create from scratch (requires phone, amount, receipt)

3. **Ledger domain functions** (`packages/backend/src/domain/ledger.ts`)
   - Add `postWithdrawal` function (wallet debit via journal entry)
   - Add `postWithdrawalReversal` function (if B2C fails after wallet debit)

4. **Migration** (`packages/backend/src/db/migrations/20261006_015_phase2_withdrawals.ts`)
   - `withdrawals` table
   - `withdrawal_reconciliation_events` table
   - `create_pending_withdrawal` function
   - `apply_withdrawal_result` function
   - `reconcile_withdrawal` function

5. **Payment provider extension** (`packages/backend/src/domain/payment-provider.ts`)
   - Add `initiateWithdrawal` method to `DepositProvider` or new `WithdrawalProvider` interface
   - Add `queryTransaction` method for reconciliation (Daraja transaction status API)

6. **Routes** (`packages/backend/src/routes/withdrawals.ts`)
   - `POST /api/v1/withdrawals` — initiate withdrawal
   - `GET /api/v1/withdrawals` — list withdrawals
   - `GET /api/v1/withdrawals/:id` — get withdrawal status
   - `GET /api/v1/withdrawals/reconcile/:receipt` — reconcile missing transaction

7. **Frontend**
   - `WithdrawalsPage.tsx` — initiate and track withdrawals
   - Update `WalletPage.tsx` — add withdrawal form
   - Update `api/client.ts` — add withdrawal API methods

8. **Tests**
   - Integration tests for withdrawal lifecycle
   - Reconciliation tests (succeeded-but-missing, duplicate callbacks)
   - Ledger integrity tests (exactly-once posting)

## Phase 3: Complete Goal Experience

### Current State
- Vaults exist with: name, description, target amount, lock dates, status, penalty policy
- Transfer between wallet ↔ vault via ledger

### Missing
- Deadline support (date field)
- Goal graduation/celebration
- Progress indicators (behind/ahead)
- Suggested contributions
- Goal prioritization

### Tasks
1. Add `deadline` and `category` columns to vaults
2. Add goal health calculation (progress vs. time)
3. Add suggested contribution calculation
4. Add goal templates (predefined goal types)
5. Backend: `/api/v1/goals` CRUD with deadline, progress calculation
6. Frontend: Enhanced savings page with progress bars, deadline timers
7. Migration: `20261006_016_phase3_goal_deadlines.ts`

## Phase 4: Allocation Engine (TIER-1)

### Goal
When income arrives (via deposit or manual entry), distribute it according to user rules. Ledger-backed, idempotent and atomic.

### Architecture
```
Income received (wallet credited or pending)
       ↓
Allocation engine (user configures rules)
       ↓
┌───────────────┐
│ Goal 1: 70%   │ → Vault (ledger transfer)
│ Goal 2: 20%   │ → Vault (ledger transfer)
│ Spending: 10% │ → Remains in wallet
└───────────────┘
       ↓
Ledger transactions (every transfer = journal entry)
```

### Modes
User selects one:
1. **Rule-based**: User defines fixed percentages per vault/budget
2. **ML-ready**: Architecture supports ML recommendations, v1 is rule-based
3. **User config**: UI for setting/editing rules

### Tasks
1. New tables: `allocation_rules`, `allocation_logs`
2. Domain: `packages/backend/src/domain/allocation.ts`
   - `applyAllocation(userId, sourceWalletId, rules)` → executes transfers atomically
   - Idempotency via allocation log + unique references
   - Handles remainder rounding (bigint-safe)
3. Routes: `/api/v1/allocation/rules` (CRUD), `/api/v1/allocation/apply`
4. Frontend: Allocation rule management UI
5. Tests: atomic execution, idempotency, balance verification
6. Migration: `20261006_017_phase4_allocation.ts`

## Phase 5: Transaction Categorization (Rule-based v1)

### Goal
"Where did my money go?" — categorize transactions for analytics.

### Tasks
1. New tables: `categories`, `transaction_categories`
2. Rule engine: merchant-name matching, keyword matching
3. Domain: `packages/backend/src/domain/categorization.ts`
   - `categorizeTransaction(transaction)` → applies rules, returns category
   - `createCategory()`, `listCategories()`, `updateCategory()`
4. Routes: `/api/v1/categories` (CRUD), `/api/v1/categories/rules`
5. Frontend: Transaction list with categories
6. Tests: rule matching, override behavior
7. Migration: `20261006_018_phase5_categories.ts`

## Phase 6: Envelope-based Budgeting

### Goal
Daily/weekly/monthly budgets using zero-based budgeting. Money is allocated to category envelopes.

### Tasks
1. Reuse `categories` from Phase 5
2. New tables: `budget_periods`, `budget_envelopes`, `budget_assignments`
3. Domain: `packages/backend/src/domain/budget.ts`
   - `createBudgetPeriod(startDate, endDate)`
   - `assignFunds(categoryId, amount)` — moves from wallet to budget (internal accounting)
   - `spendFromBudget(categoryId, amount, description)` — categorizes spending
4. Routes: `/api/v1/budgets/*`
5. Frontend: Budget page with envelopes, spending tracking
6. Migration: `20261006_019_phase6_budgets.ts`

## Phase 7: Behavioral Intelligence

### Impulse Protection (standalone first, then integrate)
1. `packages/backend/src/domain/affordability.ts`
   - `calculateGoalImpact(purchaseAmount, goals, allocationRules)`
   - Returns: goal delay, percentage drop, recovery time
2. Routes: `/api/v1/insights/affordability`
3. Frontend: "What can I afford?" page — simulate purchase impact on goals
4. Later: Integrate with allocation engine for exact goal delay

### Future Me Simulator
1. `packages/backend/src/domain/projection.ts`
   - `projectSavings(regularAmount, frequency, until)` → timeline of savings by goal
   - `adjustForIncreasedSavings(increaseAmount)` → time saved
2. Routes: `/api/v1/insights/projection`
3. Frontend: Projection timeline UI

## Phase 8: Smart Financial Insights

### Facts vs. Recommendations
- FACT: "You spent KSh 4,200 on transport this month"
- RECOMMENDATION: "You could reduce transport budget by KSh 500 next month"

### Tasks
1. New tables: `insights`, `insight_feedback`
2. Domain: `packages/backend/src/domain/insights.ts`
   - Income anomaly detection (vs. historical average)
   - Spending pattern analysis (category trends)
   - Savings rate calculation
   - Goal health status
3. Routes: `/api/v1/insights/*`
4. Frontend: Insights dashboard
5. Migration: `20261006_020_phase8_insights.ts`

## Phase 9: Motivation (Streaks, Milestones, Celebrations)

### Tasks
1. New tables: `streaks`, `milestones`, `achievements`, `badge_progress`
2. Streaks based on ledger events (deposits to goals, not button presses)
3. Milestones event-driven (first KSh 1,000 saved, first goal completed)
4. Domain: `packages/backend/src/domain/motivation.ts`
   - `checkStreaks(userId)` — evaluates ledger for streak continuity
   - `checkMilestones(userId)` — evaluates for milestone triggers
   - `awardAchievement(userId, type, metadata)`
5. Routes: `/api/v1/motivation/streaks`, `/api/v1/motivation/milestones`
6. Frontend: Streak counter, milestone badges on dashboard
7. Migration: `20261006_021_phase9_motivation.ts`

## Money Plan (Cross-cutting)

### Onboarding + Re-planning Wizard
Flow: goals → income → priorities → proposed allocation plan

1. Step 1: "What are you saving for?" → select from goal templates
2. Step 2: "How much do you expect to receive each month?" → input
3. Step 3: "What matters most?" → set priorities
4. Step 4: Show proposed plan (income → goals/vaults/spending breakdown)
5. Step 5: Adjust or confirm

### Tasks
1. Goal templates table: `goal_templates`
2. Onboarding state tracking: `onboarding_state`
3. Routes: `/api/v1/onboarding/*`
4. Frontend: Multi-step wizard
5. Integration: Creates allocation rules + goals when completed
6. Migration: `20261006_022_money_plan.ts`

## Phase Ordering & Dependencies

```
Phase 2 (Money Movement)
  ├── Withdrawals
  ├── Reconciliation (requires Daraja query API)
  └── Ledger integrity
    ↳ Phase 3 (Goals) can proceed in parallel
    ↳ Phase 4 (Allocation) depends on Phase 2 (needs wallet → vault transfers)
      ↳ Phase 5 (Categorization) needs Phase 2 (transaction metadata)
        ↳ Phase 6 (Budgets) depends on Phase 5 (categories)
          ↳ Phase 7 (Behavioral) depends on Phase 4, 5, 6
            ↳ Phase 8 (Insights) depends on 5, 6, 7
              ↳ Phase 9 (Motivation) depends on all above
```

## Testing Strategy

- Backend: integration tests with real PostgreSQL (see existing test patterns)
- Frontend: vitest unit tests + Playwright e2e
- All financial operations tested for: idempotency, atomicity, ledger balance
- Property-based tests for allocation engine (random operations, verify invariants)
