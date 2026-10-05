-- Phase 1 diagnostic reconciliation. Every statement is read-only.
-- Run with a role that has SELECT only; do not run inside a write transaction.

-- 1. Every journal entry has at least two lines and balances.
SELECT e.id, COUNT(l.id) AS line_count,
       COALESCE(SUM(l.debit_minor), 0) AS debits,
       COALESCE(SUM(l.credit_minor), 0) AS credits
FROM journal_entries e
LEFT JOIN journal_lines l ON l.journal_entry_id = e.id
GROUP BY e.id
HAVING COUNT(l.id) < 2
    OR COALESCE(SUM(l.debit_minor), 0) <> COALESCE(SUM(l.credit_minor), 0);

-- 2. Global debits and credits must agree.
SELECT COALESCE(SUM(debit_minor), 0) AS debits,
       COALESCE(SUM(credit_minor), 0) AS credits,
       COALESCE(SUM(debit_minor), 0) - COALESCE(SUM(credit_minor), 0) AS difference
FROM journal_lines;

-- 3. Wallet projections must equal their wallet ledger account balances.
SELECT w.id, w.available_minor, COALESCE(SUM(a.balance_minor), 0) AS ledger_minor
FROM wallets w
LEFT JOIN ledger_accounts a ON a.wallet_id = w.id
GROUP BY w.id, w.available_minor
HAVING w.available_minor <> COALESCE(SUM(a.balance_minor), 0);

-- 4. Vault projections must equal their vault ledger account balances.
SELECT v.id, v.balance_minor, COALESCE(SUM(a.balance_minor), 0) AS ledger_minor
FROM vaults v
LEFT JOIN ledger_accounts a ON a.vault_id = v.id
GROUP BY v.id, v.balance_minor
HAVING v.balance_minor <> COALESCE(SUM(a.balance_minor), 0);

-- 5. No impossible projection state.
SELECT 'wallet' AS projection, id, available_minor, locked_minor, pending_minor
FROM wallets
WHERE available_minor < 0 OR locked_minor < 0 OR pending_minor < 0
UNION ALL
SELECT 'vault', id, balance_minor, target_minor, 0
FROM vaults
WHERE balance_minor < 0 OR target_minor < 0;

-- 6. No orphaned journal references.
SELECT l.id AS journal_line_id, l.journal_entry_id, l.ledger_account_id
FROM journal_lines l
LEFT JOIN journal_entries e ON e.id = l.journal_entry_id
LEFT JOIN ledger_accounts a ON a.id = l.ledger_account_id
WHERE e.id IS NULL OR a.id IS NULL;

-- 7. A completed transaction must have its required journal representation.
-- Phase 1 recognizes successful transactions by source_type/source_reference.
SELECT t.id, t.type, t.status
FROM transactions t
LEFT JOIN journal_entries e
  ON e.source_type = t.type::text
 AND e.source_reference = t.id::text
WHERE t.status = 'succeeded'
  AND e.id IS NULL;

-- Interpretation: every result set should be empty except query 2, which
-- should contain difference = 0. Any row is a diagnostic discrepancy:
-- preserve the result, identify the transaction/source, and investigate
-- before applying a compensating reversal or adjustment. These queries never
-- mutate financial records.
