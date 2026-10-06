# Phase 2 frontend architecture

The frontend uses React, Vite, TypeScript, and React Router. The code is
organized around `components`, `features/auth`, `layouts`, `pages`, `services`,
`hooks`, `lib`, and `types`.

`services/api.ts` is the single HTTP client. It sends JSON requests with
credentials enabled, parses the shared backend error shape, and exposes typed
identity calls. `features/auth/AuthContext.tsx` owns the initial session check,
current user, loading state, and logout action. Protected routes render a
loading state while the session is checked and redirect unauthenticated users
to login.

Regular users use the authenticated `/dashboard` and `/account` area. Admins
with the backend-issued `admin` role additionally see the separate `/admin`
workspace and `/admin/users` operational view. The frontend only exposes
controls backed by authorized APIs; it does not provide balance editing,
transaction deletion, ledger editing, or payment forcing controls.

The application is mobile-first and uses semantic HTML, native form controls,
visible focus states, accessible labels, and inline error messages. The
dashboard deliberately shows an empty financial state because Phase 2 has no
financial read API and must not fabricate balances or activity.

Recovery and verification are represented as unavailable informational states.
They are not wired to fake backend behavior.
