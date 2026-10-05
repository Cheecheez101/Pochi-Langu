# ADR-006: Same-transaction projection maintenance

Status: Accepted for Phase 1.

Wallet, vault, and ledger-account projections are maintained by the
same-transaction service layer that appends journal entries. This keeps the
journal write and its projection update atomic, allows business validation
before commit, and makes the invariant testable without hidden side effects.

Database triggers are not used for projection maintenance. They remain
appropriate for immutable-journal and state-transition constraints only. A
future change to trigger maintenance requires a new ADR; Phase 1 must not run
both mechanisms.
