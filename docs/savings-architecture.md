# Phase 4 savings architecture

Savings goals reuse the existing `vaults` table and create a corresponding
vault ledger account. `target_minor`, `balance_minor`, `status`, and
`lock_until` are the complete goal state; no fees, penalties, taxes, or
interest semantics are added.

Wallet-to-vault and unlocked-vault-to-wallet transfers are executed by
migration-owned security-definer functions. Each operation appends a balanced
journal entry and updates the wallet/vault projections in the same transaction.
Withdrawals from a vault are rejected while its lock is active or while the
vault has not entered the approved `unlocked` state.
