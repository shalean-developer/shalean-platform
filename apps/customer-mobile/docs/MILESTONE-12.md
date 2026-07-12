# Milestone 12 — Production readiness

## What shipped (in-repo)

### Privacy & legal
- Welcome + signup **Terms / Privacy** footers → `https://shalean.co.za/privacy-policy` & `/terms-of-service`
- **Profile → Settings & legal** — support (WhatsApp / email / call), legal links, version, **Check for updates**

### Crash reporting
- `@sentry/react-native` soft-init via `EXPO_PUBLIC_SENTRY_DSN` (no-op when unset)
- `AppErrorBoundary` reports to Sentry; extras sanitized (no email/token)

### Analytics
- `trackCustomerEvent` → `POST /api/analytics/event` with allow-listed types only
- Wired: home `page_view`, book start, pay init/complete, track open, referral share, review submit
- Payloads tagged `client: customer_mobile`; PII stripped

### OTA
- Existing `expo-updates` + EAS channels; Settings check applies update when available
- Documented in `RELEASE.md`

### Perf
- React Query: `refetchOnWindowFocus: false`, `gcTime` 5m, mutation retry 0
- Cold-start target noted in UAT (measure on device)

### Docs
- `docs/RELEASE.md` — EAS secrets, builds, OTA, Sentry
- `docs/UAT.md` — full staging sign-off checklist
- `docs/STORE_LISTING.md` — copy, Data safety, identifiers

## Ops-only (not completed by this milestone alone)

- `eas init` + store credentials  
- Live Sentry project + DSN secret  
- Actual Play / App Store submission & phased rollout  
- Screenshot photography / marketing assets  

## Tests

```bash
cd apps/customer-mobile
npm run typecheck
npm run test:production
npm test
```

## Manual QA

- [ ] Settings opens privacy + terms in browser
- [ ] Support WhatsApp / mailto / tel work
- [ ] Check for updates on preview build (or shows unavailable in Expo Go)
- [ ] With Sentry DSN: trigger boundary → event in Sentry
- [ ] Analytics: booking/pay events appear in `user_events` (no email in payload)
- [ ] Complete `UAT.md` before store draft
