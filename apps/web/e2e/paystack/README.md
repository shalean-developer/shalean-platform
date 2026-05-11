# Paystack sandbox E2E (Gap 3)

Opt-in API tests that exercise **`/api/paystack/initialize`**, **`/api/paystack/verify`**, and (optionally) **`/api/paystack/webhook`** against Paystack **test** keys and your running app (`PLAYWRIGHT_BASE_URL`).

They do **not** change production payment behavior; routes under test are unchanged.

## Required environment (test mode only)

| Variable | Purpose |
|----------|---------|
| `E2E_PAYSTACK` | Set to `1` to **un-skip** Paystack specs. Without this, tests are skipped so CI and local runs stay safe. |
| `PLAYWRIGHT_BASE_URL` | App origin (default `http://localhost:3000`). |
| `PLAYWRIGHT_SKIP_WEBSERVER` | Set to `1` when the dev server is already running or when targeting a **tunnel / Vercel preview** URL. |
| `PAYSTACK_SECRET_KEY` | Paystack **secret test key** (`sk_test_…`). Used by the server for initialize/verify/webhook verification and by optional webhook tests to compute `x-paystack-signature`. |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack **public test key** (`pk_test_…`). Required for hosted checkout flows in the app (initialize uses server secret; public key is still part of a realistic checkout setup). |

### Verify-idempotency scenario (`E2E_PAYSTACK_VERIFY_REFERENCE`)

| Variable | Purpose |
|----------|---------|
| `E2E_PAYSTACK_VERIFY_REFERENCE` | A Paystack transaction **reference** that already **`success`** in the Paystack dashboard test mode (e.g. after you complete a test card payment, or reuse a known sandbox reference). Used to call `POST /api/paystack/verify` twice and assert idempotent behavior. |

**Manual-assisted flow** (when you cannot automate Paystack’s hosted payment UI):

1. Enable Paystack tests (`E2E_PAYSTACK=1`) and point `PLAYWRIGHT_BASE_URL` at your running app (local or tunnel — Paystack must reach webhook URLs only if you test webhooks; verify fallback works without a public URL).
2. Optionally run **`E2E_PAYSTACK_FULL=1`** checkout test: lock → initialize → open `authorizationUrl` in a browser → pay with Paystack [test cards](https://paystack.com/docs/payments/test-payments/).
3. Copy the **reference** from Paystack (transaction details) or from the initialize response.
4. Set `E2E_PAYSTACK_VERIFY_REFERENCE` to that reference and run `npm run test:e2e -- e2e/paystack`.

### Full checkout API smoke (`E2E_PAYSTACK_FULL`)

| Variable | Purpose |
|----------|---------|
| `E2E_PAYSTACK_FULL` | Set to `1` to run **lock → initialize** (creates `pending_payment` + Paystack reference). Does **not** complete payment unless you add browser automation separately. |

Server-side dependencies for lock + initialize:

- `BOOKING_LOCK_HMAC_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` (and related Supabase env vars)
- Same Paystack keys as above

If `USE_STRICT_AVAILABILITY=true`, `POST /api/booking/lock` requires a valid `locationId` (UUID) and `date` (`YYYY-MM-DD`) so eligibility can run; the minimal lock body in `checkout-initialize.spec.ts` assumes strict mode is **off** (default when unset).

### Optional webhook replay (`E2E_PAYSTACK_WEBHOOK_REPLAY`)

| Variable | Purpose |
|----------|---------|
| `E2E_PAYSTACK_WEBHOOK_REPLAY` | Set to `1` to run signed `charge.success` webhook posts **after** verify succeeds in the same serial block (requires `E2E_PAYSTACK_VERIFY_REFERENCE` + finalized booking). |

**Webhook signing in this repo:** `POST /api/paystack/webhook` validates `x-paystack-signature` as **HMAC-SHA512** of the **raw JSON body** using **`PAYSTACK_SECRET_KEY`** (same as the REST secret), matching Paystack’s documented approach. There is **no** separate `PAYSTACK_WEBHOOK_SECRET` in code — if documentation elsewhere mentions a webhook secret, it refers to the secret key you configure in the Paystack dashboard for signing.

## Tunnel / preview URLs

- Set `PLAYWRIGHT_BASE_URL` to your **https** preview or tunnel origin so requests hit the same deployment that has your test env vars.
- Paystack **webhooks** require a **public** URL; **`/api/paystack/verify`** fallback only needs the browser or tests to reach your app and Paystack’s API (no inbound webhook required).

## Scripts

From `apps/web`:

```bash
npx playwright install chromium
set E2E_PAYSTACK=1
set E2E_PAYSTACK_VERIFY_REFERENCE=Tnx_xxx_or_pay_xxx
npm run test:e2e -- e2e/paystack
```

(On Unix: `export …`.)

## Scope

- **Gap 3:** Paystack initialize / verify / optional webhook idempotency — **no** dashboard / dispatch lifecycle assertions (Gap 4).
