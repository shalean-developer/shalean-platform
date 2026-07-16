# R1 Production Release

**Status:** PASS — Successfully deployed and accepted  
**Release date:** 16 July 2026  
**Production commit:** `6ca3da6`  
**Production deployment:** `dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw`

## Validation

- Farai Customer UAT: PASS
- Princess Technical UAT: PASS
- Beaulla Operational UAT: PASS
- Release Candidate Governance: PASS
- Production smoke tests: PASS
- Security regression: PASS
- Post-deployment monitoring: PASS
- Rollback required: No

## Production database

No production migrations were applied during this release.

Deferred migrations:

- `20260716120000_princess_pre_push_notification_channel.sql`
- `20260716170000_beaulla_booking_confirmed_email_customer_refs.sql`

## Known non-blocking backlog

- Booking time-slot legacy `booking_date` fallback
- Push-notification production migration
- Booking-confirmation email-template migration
- Zoho credit-note integration
- SMS and WhatsApp integration
- Concurrent refund locking
- Refund webhook amount cross-check
- Supabase posture warnings
- Higher-frequency cron after Vercel Pro upgrade

## Evidence

`docs/audits/releases/r1/01-pr24-production-merge-and-smoke.md`
