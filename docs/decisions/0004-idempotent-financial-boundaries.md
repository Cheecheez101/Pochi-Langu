# ADR-004: Idempotent financial boundaries

Status: Accepted.

Transaction idempotency and provider identifiers are unique database
constraints. Retries are resolved at the transaction boundary and never create
duplicate journal representations.
