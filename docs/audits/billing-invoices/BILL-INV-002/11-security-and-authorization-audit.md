# 11 — Security and Authorization Audit

## Admin routes

| Control | Result |
|---------|--------|
| `/api/admin/invoices*` mutations | `requireAdminApi` (Bearer allowlist) |
| Office pages | `useRoleRouteGuard({ requiredRole: "admin" })` |
| PDF download | Cookie `isAdmin` (CSRF download risk Low) |
| Repair drift routes | Admin-gated |

## Public payment

| Control | Result |
|---------|--------|
| `/pay/invoice` without ref | Incomplete — no checkout |
| Wrong ref | 403 |
| Paid / zero / closed | 410 |
| Rate limit on monthly re-init | **Missing** (**M14**) — booking initialize has abuse limits |

## Customer ownership

Customer/account PDF routes filter `customer_id = user.id` — OK. Thin unit coverage (**L04**).

## RLS / grants

| Table | RLS | Notes |
|-------|-----|-------|
| `monthly_invoices` | Select own | Service role for server |
| `payment_transactions` | Deny authenticated | Baseline also `GRANT ALL` to anon/authenticated — mitigated by RLS deny, still noisy privilege surface (**L05**) |

## RPC / IDOR

- Invoice UUID alone insufficient for pay.
- Paystack reference is capability token — must not appear in public logs unmasked (**L06**).
- Metadata not sole financial authority — good.

## CSRF / methods

Mutations POST/PATCH with Bearer — not cookie CSRF-friendly. PDF cookie GET is exception.

## Idempotency keys

Admin billing idempotency tables exist for selected admin actions. Charge dedup prevents double apply per gateway reference.

## Secrets

No secret keys observed in audited log contexts. Full Paystack references and emails appear in some logs.
