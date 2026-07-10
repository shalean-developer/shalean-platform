# Promotion & Campaign Management System

Configurable promotions engine for Shalean. Admins create, schedule, pause, and measure campaigns from **Office → Growth → Promotions** without code changes. Checkout evaluation is server-side and wired into **booking-v2**.

## Architecture

```
Admin UI (/office/promotions)
        │
        ▼
API /api/admin/promotions*
        │
        ▼
Postgres: promotions, promotion_redemptions, promotion_events,
          promotion_bundles, membership_plans, customer_memberships,
          birthday_rewards, marketing_automation_rules, promotion_audit_log
        │
        ▼
lib/promotions (evaluate + apply)
        │
        ├── booking-v2 confirm (auto-apply + promo codes)
        ├── /api/promotions (public display)
        ├── /api/account/rewards (customer hub)
        └── cron /api/cron/promotions (status sync + birthdays)
```

## Promotion types

| Type | Behaviour |
|------|-----------|
| `first_booking` | Auto %/fixed off when customer has **0 completed bookings**; one redemption per customer |
| `referral` | Display + settings mirror; **real rewards** still run via existing referrals module |
| `membership` | Discount from active `customer_memberships` + `membership_plans` |
| `bundle` | Matches `promotion_bundles` service/extra combos; auto-applies best match |
| `birthday` | Cron issues Cleaning Credit once per year; 30-day validity (configurable) |
| `seasonal` / `promo_code` / `custom` | Scheduled campaigns with optional codes, banners, announcement bar |

## Stacking rules

1. Evaluate all live auto-apply + matching promo-code promotions.
2. Keep the **best non-stackable** discount (highest ZAR, then lowest `stack_priority`).
3. Keep all **stackable** discounts (e.g. membership).
4. Then apply **referral checkout discount**, then **Cleaning Credit** spend.
5. Cap total discount at booking subtotal. All eligibility is re-checked on the server at confirm.

## Checkout order (booking-v2)

`subtotal → promotion discounts → referral discount → cleaning credit → Paystack amount`

## Admin capabilities

- Create / edit / duplicate promotions
- Schedule (`scheduled` → `active` via cron), pause, resume, end
- Budgets, usage limits, eligibility JSON, display flags
- Analytics KPIs + CSV export
- Membership plans + assign membership
- Marketing automation rule toggles

## Customer surfaces

- `/account/rewards` — Rewards & Offers hub
- `/account/referrals` — referral link, credits, history (existing)
- Checkout promo code field + auto-applied offers
- Homepage announcement bar (`PromotionAnnouncementBar`)

## Birthday automation

1. Store `user_profiles.date_of_birth`
2. Daily cron `/api/cron/promotions` finds birthdays, issues credit via `creditCleaningCredit`, writes `birthday_rewards`
3. Email templates live in `marketing_automation_rules` (enable in admin)

## Referral integration

Referral **reward amounts, fraud, and credit issuance** remain in `lib/referrals` and Office → Referrals. The promotions row `referral-rewards` is the marketing/display counterpart; adjust live reward ZAR in referral program settings.

## Migrations

- `supabase/migrations/20261066_promotions_campaign_system.sql`

Apply with your usual Supabase migration workflow before using admin UI in production.

## Key APIs

| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/api/admin/promotions` | Admin |
| GET/PATCH/POST | `/api/admin/promotions/[id]` | Admin |
| GET | `/api/admin/promotions/analytics` | Admin (`?format=csv`) |
| GET/POST | `/api/admin/memberships` | Admin |
| GET/PATCH | `/api/admin/marketing-automation` | Admin |
| GET/POST | `/api/promotions` | Public |
| POST | `/api/promotions/validate` | Optional bearer |
| GET | `/api/account/rewards` | Customer |
| POST | `/api/cron/promotions` | `CRON_SECRET` |

## Security

- Eligibility and discount math are **server-side only**
- Redemptions use **idempotency keys** (`bv2:{promoId}:{bookingId}`)
- Audit log on create/update
- RLS: public read of active promotions; customers read own memberships/birthday rewards
