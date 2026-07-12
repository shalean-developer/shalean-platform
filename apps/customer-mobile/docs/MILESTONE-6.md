# Milestone 6 — Payments

## What shipped

- Paystack **Inline** checkout (public key only) after booking-v2 confirm → `pending_payment`
- Confirm navigates to `/book/pay` with `bookingId`, `reference` (`paystackReference`), `amount` (`payAmountZar`), `email`
- Optional `POST /api/bookings/payment-precheck` before opening Inline
- WebView HTML loads `https://js.paystack.co/v1/inline.js` with existing `bv2_…` reference (not `/api/paystack/initialize`)
- On Inline success → `/book/success?reference=…` runs verify + status poll
- `POST /api/paystack/verify` — 3 attempts, 1500ms delay (mirror web `/booking/success`)
- On persist-pending: `GET /api/paystack/status?reference=` up to ~10 polls @ 2s until status leaves `pending_payment`
- Webhook remains authority — app never marks paid locally
- `@shalean/api-client` `createPaystackApi`: verify, status, paymentPrecheck (`skipAuth: true`)

## Screens

| Route | Role |
|-------|------|
| `/book/pay` | Amount + booking snippet, precheck, Paystack WebView; cancel → retry / Bookings |
| `/book/success` | Phases: `finalizing` \| `success` \| `persist_pending` \| `needs_retry` \| `failed` \| `cancelled` |

Deep link: open `/book/success` with `reference` (or `trxref`) to re-run verify without WebView.

## APIs used

- `getPaystackApi().paymentPrecheck` → `POST /api/bookings/payment-precheck`
- `getPaystackApi().verify` → `POST /api/paystack/verify`
- `getPaystackApi().status` → `GET /api/paystack/status`

## Env

```
EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_…
```

Never put the Paystack **secret** in the app.

## Contract tests

```bash
cd apps/customer-mobile
npm run test:payment
```

## Manual QA

- [ ] Confirm creates `pending_payment` and opens `/book/pay` with amount + reference
- [ ] Precheck failure shows recovery (no silent Paystack open)
- [ ] Inline opens with correct amount (ZAR × 100) and existing `bv2_…` reference
- [ ] Success → success screen finalizing → success when booking left `pending_payment`
- [ ] Persist-pending copy is honest (“payment received, saving booking”); Check again works
- [ ] Cancel → “Payment cancelled. Booking saved — retry” + Retry / Bookings
- [ ] Deep link `/book/success?reference=…` re-runs verify
- [ ] `npm run typecheck` and `npm run test:payment` pass
- [ ] No Paystack secret in client bundle / env

## Not in this milestone

- Booking detail / track (M7–M8)
- Invoice pay deep links (M9)
- Marking paid from the client (forbidden — webhook/verify only)
