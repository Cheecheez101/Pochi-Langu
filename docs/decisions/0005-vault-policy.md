# ADR-005: Vault policy

Status: Accepted for Phase 1 schema/state foundations.

- Vault policy is selected at creation and is immutable.
- `ACTIVE -> UNLOCKED` and `UNLOCKED -> CLOSED` are valid transitions.
- `ACTIVE -> BROKEN` is valid only for the penalty policy.
- Penalty calculation, payout, and provider behavior remain deferred.
