/**
 * ## Paystack HTTP route responsibility (checkout vs polling vs transfers)
 *
 * Single source of truth for **which routes may persist paid booking state**. Amounts and Paystack API behavior are unchanged; this module documents and is referenced by static tests.
 *
 * | Route | Class | Persists / finalizes checkout? | Notes |
 * |-------|--------|--------------------------------|--------|
 * | `POST /api/paystack/initialize` | Initialize payment | **Creates/updates `pending_payment` row** + returns Paystack authorization URL | {@link processPaystackInitializeBody} |
 * | `POST /api/paystack/webhook` | **Authoritative charge finalizer** | **Yes** — `charge.success` → {@link finalizePaidBooking} (idempotent skip if already not `pending_payment`) | Also handles `charge.failed`, monthly invoice settlement branches |
 * | `GET/POST /api/paystack/verify` | **Verify + fallback finalizer** | **Yes** when charge `success` — {@link runPaystackVerifyFinalizePipeline} → {@link finalizePaidBooking} | Rate-limited; idempotent with webhook |
 * | `POST /api/payments/verify` | **Retired legacy verify alias** | **No** — always returns `410 Gone` | Tombstone only; older clients must move to `/api/paystack/verify` |
 * | `GET /api/booking/status` | **Polling / display only** | **No booking writes** — Paystack verify + optional **read** `bookings` | Success page polling |
 * | `POST /api/booking/complete` | **Display / helper only** | **No** — Paystack verify JSON for UI only | Name is historical; not service completion |
 * | `GET /api/paystack/status` | DB lookup only | **No** — read id/status by reference | Does not call Paystack |
 * | `POST /api/webhooks/paystack` | **Transfer / payout rail** | **No checkout booking finalize** — `transfer.success` / `transfer.failed` only | Not `charge.success` |
 *
 * ### Library layering (not routes)
 *
 * - {@link finalizePaidBooking} in `bookingOperations.ts` wraps {@link finalizePaystackChargeSuccess} (single internal finalize gateway used by webhook, verify pipeline, retry jobs).
 * - Do not add new booking payment finalization routes without updating this table and the guardrail tests.
 *
 * @module paystackRouteResponsibilityContract
 */

/** Routes under `app/api` that may run checkout finalization (charge success paths). */
export const PAYSTACK_CHECKOUT_FINALIZER_ROUTE_FILES = [
  "paystack/webhook/route.ts",
  "paystack/verify/route.ts",
] as const;

/** Relative to `app/api`. */
export type PaystackCheckoutFinalizerRouteFile = (typeof PAYSTACK_CHECKOUT_FINALIZER_ROUTE_FILES)[number];
