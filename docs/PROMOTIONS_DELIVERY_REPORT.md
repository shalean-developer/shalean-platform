# Promotions & Campaign System — Delivery Report

## Summary

Shalean now has a **Promotion & Campaign Management System** integrated with booking-v2 checkout, referrals/cleaning credit, admin Office, and the customer account. Campaigns are configurable from the admin dashboard without code changes.

## How to enable

1. Apply migration: `supabase/migrations/20261066_promotions_campaign_system.sql`
2. Deploy web app (includes cron `/api/cron/promotions` in `vercel.json`)
3. Open **Office → Growth → Promotions**
4. Activate/schedule campaigns; set referral reward ZAR under **Referrals** settings if you want R200/R200

## Seeded promotions

| Promotion | Status | Notes |
|-----------|--------|-------|
| First Booking 15% | Active | Auto-apply, 1× per customer, homepage/booking/pricing |
| Referral Rewards | Active | Display hub; logic remains in referrals module |
| Birthday Credit R200 | Active | Cron + Cleaning Credit; DOB on profile |
| Bundle Discounts | Active | 4 example bundles |
| Spring Cleaning 2026 | Draft | Seasonal template with `SPRING10` |
| Membership plans | Enabled | Weekly 15% / Bi-weekly 10% / Monthly 5% |

## Files changed / added

### Database
- `supabase/migrations/20261066_promotions_campaign_system.sql`

### Engine
- `apps/web/lib/promotions/types.ts`
- `apps/web/lib/promotions/evaluate.ts`
- `apps/web/lib/promotions/server.ts`
- `apps/web/lib/promotions/birthday.ts`
- `apps/web/lib/promotions/analytics.ts`
- `apps/web/lib/promotions/index.ts`
- `apps/web/lib/promotions/__tests__/evaluate.test.ts`
- `apps/web/lib/booking/promoCodes.ts` (deprecated note)

### APIs
- `apps/web/app/api/admin/promotions/route.ts`
- `apps/web/app/api/admin/promotions/[id]/route.ts`
- `apps/web/app/api/admin/promotions/analytics/route.ts`
- `apps/web/app/api/admin/memberships/route.ts`
- `apps/web/app/api/admin/marketing-automation/route.ts`
- `apps/web/app/api/promotions/route.ts`
- `apps/web/app/api/promotions/validate/route.ts`
- `apps/web/app/api/account/rewards/route.ts`
- `apps/web/app/api/cron/promotions/route.ts`
- `apps/web/app/api/booking-v2/confirm/route.ts` (promo apply + redemptions)

### UI
- `apps/web/components/admin/promotions/PromotionsAdminDashboard.tsx`
- `apps/web/app/(ui-redesign)/office/promotions/page.tsx`
- `apps/web/app/(ui-redesign)/account/rewards/page.tsx`
- `apps/web/components/promotions/PromotionAnnouncementBar.tsx`
- `apps/web/app/(marketing)/layout.tsx`
- `apps/web/src/features/office/OfficeNav.tsx`
- `apps/web/src/features/account/AccountNav.tsx`
- `apps/web/src/features/booking-v2/steps/Step4Payment.tsx`
- `apps/web/src/features/booking-v2/schemas.ts`
- `apps/web/app/(ui-redesign)/account/profile/page.tsx` (date of birth)

### Config / docs
- `apps/web/vercel.json` (daily promotions cron)
- `docs/PROMOTIONS_ENGINE.md`
- `docs/PROMOTIONS_DELIVERY_REPORT.md` (this file)

## New database structures

- `promotions`, `promotion_redemptions`, `promotion_events`, `promotion_bundles`
- `membership_plans`, `customer_memberships`
- `birthday_rewards`, `marketing_automation_rules`, `promotion_audit_log`
- `user_profiles.date_of_birth`
- RPC `sync_promotion_statuses()`

## Automation workflows

| Trigger | Mechanism |
|---------|-----------|
| Campaign start/end | Cron syncs `scheduled`→`active`, `active`→`expired` |
| Birthday | Cron issues Cleaning Credit + `birthday_rewards` row |
| Marketing rules | Admin toggles; templates seeded (email) |
| Referral complete | Existing referral crons/credit path (unchanged) |
| Checkout auto-apply | booking-v2 confirm evaluates promotions |

## Testing performed

- Unit tests: `lib/promotions/__tests__/evaluate.test.ts` — **8 passed** (discount math, first-booking eligibility, promo codes, stacking, bundles)

## Known follow-ups (not blockers)

- Membership **Paystack recurring billing** is plan-config + admin assign today; wire payment collection when ready
- Birthday **email/SMS send** uses automation rule templates — connect to Resend/SMS sender in cron (credit issuance already works)
- Push notifications: schema/channel ready (`push`), no device token pipeline yet
- Legacy booking funnel still uses hardcoded `promoCodes.ts`; booking-v2 is the primary path
- Set referral program reward to R200 in Office → Referrals if not already
