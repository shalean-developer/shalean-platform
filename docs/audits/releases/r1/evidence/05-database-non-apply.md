# Database Non-Apply Verification

Production project: tchayecuvzssixyxlvfu ("shalean-platform", ACTIVE_HEALTHY, eu-west-3).
All checks are READ-ONLY SELECTs. NO migration applied, NO db push run.

## 1. Migration history (supabase_migrations.schema_migrations)
Query: select version from schema_migrations where version in ('20260716120000','20260716170000')
Result: [] (neither version present)
Latest applied migration: 20261071 (booking_fulfillment_mode_and_demand)

## 2. Migration 20260716120000 (Princess PR E — push/expo channels) — UNAPPLIED
Live production constraints:
- notification_logs_channel_check      = CHECK (channel = ANY (ARRAY['email','whatsapp','sms']))   -> no 'push'
- notification_logs_provider_check     = CHECK (provider = ANY (ARRAY['resend','twilio','meta']))   -> no 'expo'
- notification_idempotency_claims_channel_check = CHECK (channel = ANY (ARRAY['email','sms','in_app'])) -> no 'push'
The migration would add 'push'/'expo'; production lacks them => UNAPPLIED.

## 3. Migration 20260716170000 (Beaulla booking_confirmed email) — UNAPPLIED
Live production templates row (key=booking_confirmed, channel=email):
- updated_at = 2026-06-22 07:04:49+00
The migration performs UPDATE ... set updated_at = now(); a July-16 apply would move updated_at to
2026-07-16. Since updated_at is 2026-06-22 (and version absent from history) => UNAPPLIED.
(Subject text coincidentally already similar; the updated_at timestamp is the decisive proof.)

## 4. No migration command during Vercel build
Build logs (dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw) show only: npm ci -> next build (typecheck, compile,
static generation). No `supabase db push`, no `supabase migration`, no migration replay.

## 5. No production schema / migration-history change
Confirmed: history unchanged (latest 20261071), target constraints unchanged, target template row unchanged.

DECISION: Both migrations remain UNAPPLIED on production. No schema or migration-history change occurred.
