# Shalean Customer — Release & EAS

Release engineering for `apps/customer-mobile`.  
**Do not commit secrets.** Use EAS Secrets and a local gitignored `.env`.

**Separate EAS project and store listing from the Cleaner app** (`apps/mobile`).

---

## 1. Build checklist

1. [ ] `npm install` in `apps/customer-mobile`
2. [ ] Copy `.env.example` → `.env` and fill values
3. [ ] `npx expo-doctor` (monorepo Metro warnings are expected)
4. [ ] `npm run typecheck` && `npm test`
5. [ ] `eas login` + `eas init` (new project — not Cleaner)
6. [ ] Set `EXPO_PUBLIC_EAS_PROJECT_ID` (or EAS Secret)
7. [ ] Set remaining EAS Secrets (below)
8. [ ] Confirm assets under `assets/images/`
9. [ ] `eas build --profile preview --platform android`

---

## 2. EAS Secrets

| Secret | Preview | Production |
|--------|---------|------------|
| `EXPO_PUBLIC_API_BASE_URL` | Staging or prod | `https://shalean.co.za` |
| `EXPO_PUBLIC_SUPABASE_URL` | Matching | Prod |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Matching | Prod anon |
| `EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY` | Test or live **pk_** | Live **pk_** only |
| `EXPO_PUBLIC_APP_ENV` | `preview` (eas.json) | `production` |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | From `eas init` | Same |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry project DSN | Same / prod project |

Optional: `EXPO_PUBLIC_SENTRY_DEV=1` to send crashes from `__DEV__`.

---

## 3. Commands

```bash
cd apps/customer-mobile
npx eas-cli login
npx eas-cli init
# set secrets…
npm run eas:preview:android
# later:
npm run eas:production:android
```

### OTA (after a store/native baseline exists)

```bash
npx eas-cli update --channel preview --message "hotfix: …"
npx eas-cli update --channel production --message "hotfix: …"
```

In-app: **Profile → Settings & legal → Check for updates**.

---

## 4. Crash reporting

1. Create a Sentry project for **Shalean Customer** (not Cleaner).
2. Set `EXPO_PUBLIC_SENTRY_DSN` in EAS Secrets.
3. Rebuild (native plugin). Soft-init is a no-op when DSN is unset.

---

## 5. Analytics

Mobile posts to `POST /api/analytics/event` with allow-listed `event_type` values and `payload.client = customer_mobile`.  
No emails/phones in payloads.

---

## 6. Store submit (ops)

```bash
eas build --profile production --platform android
eas submit --profile production --platform android
```

iOS: configure Apple credentials, then TestFlight → App Store.  
See `STORE_LISTING.md` and `UAT.md` before requesting review.

---

## 7. Rollback

- **Native:** keep previous EAS build install link / Play staged release rollback.
- **OTA:** publish previous update or disable channel update; users can reinstall last known-good APK/AAB.

---

## 8. Identifiers

| Item | Value |
|------|--------|
| iOS bundle | `za.co.shalean.customer` |
| Android package | `za.co.shalean.customer` |
| Scheme | `shalean-customer://` |
| Expo slug | `shalean-customer` |
| Privacy | https://shalean.co.za/privacy-policy |
| Terms | https://shalean.co.za/terms-of-service |
