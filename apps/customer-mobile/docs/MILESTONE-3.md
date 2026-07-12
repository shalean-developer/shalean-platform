# Milestone 3 — Authentication

## What shipped

- Email/password sign-in & sign-up via Supabase Auth (same as web customers)
- SecureStore token persistence (`shalean.customer.*` keys)
- JWT refresh + `@shalean/api-client` bearer + retry on 401
- `POST /api/auth/resolve-profile` role gate (customer only)
- `POST /api/auth/forgot-password` (reset link opens web `/auth/reset-password`)
- Auth gate, welcome / login / signup / forgot / reset-password screens
- Profile tab sign-out

## Manual QA

- [ ] Sign up → lands on Home (or email confirm notice)
- [ ] Sign in with existing customer → Home
- [ ] Cleaner account → blocked with Cleaner app message
- [ ] Kill app → session restores
- [ ] Sign out → welcome
- [ ] Forgot password → success copy (check email / rate limit)
- [ ] Missing Supabase env → clear error on sign-in

## Not in this milestone

- Guest checkout linking
- In-app password update after recovery token (web link remains source of truth)
- Home dashboard data (Milestone 4)
