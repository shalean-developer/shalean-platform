# Store listing prep — Shalean Customer

Use for App Store Connect + Google Play. **Do not reuse Cleaner listing assets or package IDs.**

## Identifiers

| | |
|--|--|
| Display name | Shalean |
| Subtitle / short | Book trusted home cleaning |
| iOS bundle | `za.co.shalean.customer` |
| Android applicationId | `za.co.shalean.customer` |
| Support URL | https://shalean.co.za |
| Privacy Policy URL | https://shalean.co.za/privacy-policy |
| Terms | https://shalean.co.za/terms-of-service |
| Support email | support@shalean.com (see `@shalean/utils/customerSupport`) |

## Short description (Play, ≤80)

Book, pay, and track home cleaning with Shalean — trusted cleaners on demand.

## Full description (draft)

Shalean helps you book professional home cleaning in Cape Town and surrounds.

• Choose a service and schedule in minutes  
• Pay securely with Paystack  
• Track your cleaner on the day  
• Manage bookings, invoices, and addresses  
• Earn cleaning credit by referring friends  

Support: WhatsApp, phone, or email from Profile → Settings.

## Screenshots checklist

- [ ] Home (next booking)
- [ ] Booking wizard / catalog
- [ ] Checkout / payment
- [ ] Booking detail + track
- [ ] Rewards / referral share
- [ ] Profile / settings (legal visible)

Phone + 7" tablet (Play) / 6.7" + 12.9" (iOS) as required by each store.

## Data safety / App Privacy (summary)

| Data | Purpose | Linked to user? | Notes |
|------|---------|-----------------|-------|
| Email, name, phone | Account | Yes | Supabase auth + profile |
| Precise location | Tracking day-of | Yes | Only when cleaner trackable |
| Purchase history | Bookings / invoices | Yes | Paystack; no card storage in app |
| Device IDs / push token | Notifications | Yes | Expo push → `user_push_tokens` |
| Crash logs | Stability | No PII by default | Sentry; `sendDefaultPii: false` |
| Analytics events | Product funnel | Session id only | `/api/analytics/event`; no email/phone in payload |

**Not collected in app:** contacts, photos (customer MVP), health, financial account numbers.

## Review notes (rejection risk mitigation)

- Account required for booking/pay (no guest checkout in MVP).
- Payments via Paystack Inline WebView — cards never stored in the app.
- Login demo: provide reviewer credentials if requested.
- Tracking requires an active day-of booking with assigned cleaner.

## Ops before submit

1. Complete `UAT.md` sign-off  
2. Production EAS secrets + Sentry DSN  
3. Privacy policy live and matching this form  
4. `eas build --profile production` + draft submit track  
5. Phased rollout (Play internal → closed → production %)
