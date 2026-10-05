# ADR-002: Ledger as the source of truth

Status: Accepted.

The PostgreSQL journal is the authoritative record. Wallet and vault balances
are projections and must be reproducible from journal lines and reconciled by
the read-only diagnostic queries in `docs/reconciliation.sql`.
