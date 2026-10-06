# Phase 2 identity architecture

## Identity model

The existing Phase 1 `users` table remains the ownership anchor for financial
records. Phase 2 adds `user_profiles` and `user_credentials` as one-to-one
tables, plus `auth_sessions` for server-side session lifecycle. This avoids
duplicating the financial owner identity and does not change any Phase 1
financial migration.

Registration normalizes Kenyan mobile numbers to E.164 form, creates the
ownership user, profile, credential record, and empty KES wallet in one
transaction. No ledger account or journal entry is created by registration.

## Authentication and sessions

Passwords are hashed with Node's scrypt implementation using a random salt and
are never returned or logged. Login creates a random opaque session token; only
its SHA-256 hash is stored in PostgreSQL. The token is sent in an HttpOnly,
SameSite=Lax cookie scoped to `/api`, with a seven-day expiration. Production
adds the Secure attribute.

Logout marks the server-side session revoked and clears the cookie. Every
protected request checks the hash, revocation state, and expiry before deriving
the authenticated user from the session. The browser never stores an access
token in localStorage or sessionStorage. SameSite cookies and the configured
credentialed CORS origin provide the initial CSRF boundary; state-changing
endpoints must retain this restriction as the API grows.

Password recovery and verification workflows are intentionally not implemented
in this foundation. The UI exposes clear unavailable states rather than
pretending that those flows exist.

## Authorization and API conventions

Authentication middleware attaches the user ID from the validated session, not
from request body or query parameters. Future user-owned resources must filter
by this trusted ID. Phase 2 exposes identity endpoints and narrowly scoped
read-only admin operational routes; it does not expose arbitrary financial
posting or direct database access.

Identity roles are stored separately in `user_roles` and default to `user`
through a migration-owned trigger. Admin routes require both a valid session
and the `admin` role. Regular users receive no admin data by changing a URL,
and admin routes are read-only operational views; they cannot edit balances,
delete transactions, or mutate journal history.

Errors use `{ ok: false, error, requestId }`, with optional field-level
validation details. Passwords, hashes, cookies, database credentials, and
stack traces are excluded from responses and structured logs.

## Database and local development

The authoritative environment remains PostgreSQL 16 at `localhost:15432`,
database `pochi_langu`. Run migrations with the migration role and run the
backend with `pochi_langu_app`; the existing startup identity guard remains
mandatory. Apply the new forward migration with `npm run migrate` after
starting the Docker database.

## Deferred functionality

Email/SMS verification, account recovery, financial posting APIs, M-Pesa,
Daraja, STK Push, callbacks, B2C, withdrawals, and real-money testing remain
outside Phase 2.
