# MASTER-01A-02 — Auth and session source-of-truth convergence

Date: 2026-10-05

## Finding

The current Booking V2 payment gate does not use the historical guest magic-link upgrade endpoint.

The live staging test on the production-derived Supabase branch proved the active flow:

1. Step 4 creates an account with `authClient.signUp(email, password, ...)`.
2. Supabase returned a live session immediately for the staging Auth configuration.
3. Booking V2 advanced directly to **Confirm & pay**.
4. No `/api/auth/create-from-guest` request or `/auth/callback` navigation was involved.

Repository-wide code search found no runtime caller for `/api/auth/create-from-guest`. Its references were documentation, historical audit evidence, a legacy migration comment, and regression tests. The only code that generated `/auth/callback` magic links was that endpoint itself.

Production Supabase Auth logs over the audited 24-hour window also showed no magic-link / OTP auth activity.

## Canonical runtime source of truth

Booking authentication is:

- password signup: `apps/web/lib/auth/authClient.ts::signUp`
- password sign-in: `apps/web/lib/auth/authClient.ts::signIn`
- Booking V2 gate: `apps/web/src/features/booking-v2/steps/Step4Payment.tsx`
- post-auth guest booking attribution: `apps/web/lib/booking/clientLinkBookings.ts` → `/api/bookings/link-user`
- dashboard ownership repair: `/api/auth/link-guest-bookings`

## Cleanup

The following unreferenced compatibility surface is retired:

- `/api/auth/create-from-guest`
- `/auth/callback`
- `bootstrapAuthCallbackSession`
- callback-only regression suite

The previously added callback hardening is therefore superseded by source-of-truth cleanup rather than promoted as a customer-critical flow.

## Regression

A required CI contract now proves:

- the retired route/page/helper stay absent;
- Booking V2 continues to use `signIn` / `signUp`;
- post-auth booking attribution remains on `/api/bookings/link-user`;
- the dashboard repair path remains authenticated and separate.

No database or production customer-data mutation is part of this stage.
