# Phase 3 wallet and deposit architecture

## Wallet source of truth

`wallets.available_minor` is a read projection of the wallet ledger account.
The ledger account and wallet projection are updated together by the
security-definer settlement function. All amounts are KES bigint minor units.

## Deposit lifecycle

Deposits begin as `pending`, receive Daraja merchant/checkout references, and
remain pending until the real Daraja callback is processed. Success moves the
transaction and deposit to `succeeded`, appends one balanced journal entry,
credits the wallet ledger account, and updates `available_minor`. Failure and
uncertain outcomes remain visible without crediting the wallet.

Provider observations are append-only in
`deposit_reconciliation_events`. Repeated successful callbacks are idempotent:
the existing journal entry is retained and no second credit is posted.

## Provider boundary

`DepositProvider` is the only application-facing provider contract. The
repository supplies `DarajaSandboxProvider`, which obtains a sandbox OAuth
token, initiates STK Push, and parses the real Daraja callback. There is no
live-money M-Pesa, B2C, withdrawal, or production payout execution.
