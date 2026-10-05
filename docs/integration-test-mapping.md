# Core database integration-test mapping

The original required seven tests are the seven `it` blocks in
`packages/backend/src/__tests__/database.integration.test.ts`:

1. `enforces KES, bigint projection amounts, and non-negative wallet balances`
   verifies currency, signed database widths, and non-negative projections.
2. `rejects duplicate idempotency and provider identifiers` verifies retry and
   provider-reference uniqueness.
3. `rejects invalid transaction status transitions` verifies the transaction
   state machine.
4. `rejects unbalanced and zero-line journal entries at commit` verifies
   deferred journal-balance constraints.
5. `rejects UPDATE, DELETE, and TRUNCATE as the application role` verifies
   append-only journal permissions.
6. `accepts a reversal linked through reversal_of_entry_id` verifies reversal
   linkage.
7. `enforces the approved vault state transitions` verifies vault transitions
   and penalty-policy immutability.

The additional `financial.property.test.ts` test is not part of the original
seven. It generates deposits, transfers, and reversals against PostgreSQL and
checks balanced journals, non-negative projections, and projection/ledger
totals.
