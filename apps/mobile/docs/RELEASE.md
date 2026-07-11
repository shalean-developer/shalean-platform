# Shalean Cleaner — Release & EAS documentation

Internal beta release engineering for `apps/mobile`.  
**Do not commit secrets.** Use EAS Secrets and a local gitignored `.env`.

---

## 1. Build checklist

Before the first Android Preview build:

1. [ ] `npm install` from repo root (workspaces) and `apps/mobile`
2. [ ] Copy `.env.example` → `.env` and fill Supabase + API URL for local smoke tests
3. [ ] `npx expo-doctor` (Metro monorepo warnings are expected)
4. [ ] `npm run typecheck`
5. [ ] Install EAS CLI: `npm i -g eas-cli` (or use `npx eas-cli`)
6. [ ] Log in: `eas login`
7. [ ] From `apps/mobile`: `eas init` — writes real `extra.eas.projectId`
8. [ ] Set EAS Secrets (see Environment section)
9. [ ] Confirm branded assets exist under `assets/images/`
10. [ ] Run: `eas build --profile preview --platform android`

---

## 2. Release checklist (internal beta)

1. [ ] Preview APK builds successfully on EAS
2. [ ] Install on at least 2 physical Android devices
3. [ ] Sign in with a real cleaner account
4. [ ] Confirm jobs load against the intended API (staging or prod — as decided)
5. [ ] Accept / complete one job (or queue offline + sync)
6. [ ] Upload one before/after photo
7. [ ] Settings → Diagnostics → Export works
8. [ ] Support channel + tester guide shared
9. [ ] Known issues list sent to testers
10. [ ] Previous working build link retained for rollback

---

## 3. Environment & EAS Secrets

| Secret / env | Preview | Production | Notes |
|---|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Staging or prod URL | `https://shalean.co.za` | Required |
| `EXPO_PUBLIC_SUPABASE_URL` | Matching project | Prod project | Required for session refresh |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Matching anon key | Prod anon | Public client key; still use Secrets |
| `EXPO_PUBLIC_APP_ENV` | `preview` (set in eas.json) | `production` | Also in profile `env` |
| `EXPO_PUBLIC_BUILD_NUMBER` | Optional | Optional | `autoIncrement` bumps `versionCode` |
| `EAS_PROJECT_ID` | From `eas init` | Same | Used for Updates URL |
| `GOOGLE_SERVICES_JSON` | Optional until push E2E | Required for FCM later | Path or EAS file secret |

Commands:

```bash
cd apps/mobile
eas secret:create --scope project --name EXPO_PUBLIC_API_BASE_URL --value "https://YOUR_API"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "YOUR_ANON_KEY"
```

Prefer **environment-specific** secrets in EAS when available (`preview` vs `production`).

---

## 4. Exact commands — first Preview APK

```bash
# One-time
cd apps/mobile
npm install
npx eas-cli login
npx eas-cli init
# paste / confirm project; ensure app.config.ts extra.eas.projectId is set

# Secrets (once per project / environment)
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_API_BASE_URL --value "https://shalean.co.za"
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "<url>"
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon>"

# Build
npx eas-cli build --profile preview --platform android
```

Or: `npm run eas:preview:android`

After build completes, open the EAS build page → **Install** / download APK → share with testers.

---

## 5. Internal tester guide

### Install
1. Open the link from Shalean ops (EAS install page or APK).
2. On Android, allow “Install unknown apps” for your browser/Files if prompted.
3. Install **Shalean Cleaner**.
4. Open the app → sign in with your cleaner phone + password (same as the website).

### Day-to-day
- **Today’s jobs** appear on the home screen.
- Tap a job for details, actions, and photos.
- If you see **You’re offline**, you can still view cached jobs; actions sync when you reconnect.
- Use **Settings → Sync now** if something looks stale.
- If something breaks: **Settings → About / Diagnostics → Export diagnostic logs** and send to support (WhatsApp/email as instructed).

### Updating
- Ops will send a new install link when a new Preview build is ready.
- Uninstall the old app only if asked; otherwise install over the existing package (`za.co.shalean.mobile`).

---

## 6. Updating preview builds & rollback

**Update:** bump is automatic via `autoIncrement` on preview; run another `eas build --profile preview --platform android`; distribute the new link.

**Rollback:** keep the previous EAS build URL; ask testers to install that APK. No OTA channel is required for the first beta (Updates is configured once `projectId` exists; publish later with `eas update --channel preview`).

---

## 7. Known issues (disclose to testers)

- Push job alerts are **not live** yet (token is local only).
- First install may ask for camera / photos / notifications permissions.
- Session refresh requires correct Supabase secrets; wrong env → re-login prompts.
- Diagnostics export can include job IDs — share **only** with Shalean support.
- Branding icons are interim; notification glyph is a simplified mark.
- Expo Doctor may warn about Metro monorepo settings — expected.

---

## 8. Future production tasks

1. Complete EAS `projectId` + Apple credentials for iOS TestFlight  
2. FCM `google-services.json` + server-side Expo push token registration  
3. Sentry (or equivalent) crash reporting  
4. Play Store listing, privacy policy, Data safety form  
5. Production AAB (`eas build --profile production --platform android`)  
6. `eas update` OTA workflow for JS hotfixes  
7. Designer-polished adaptive icon + true white-only notification asset  
8. Android App Links (`https://shalean.co.za/...`) with `autoVerify`  
9. Photo upload 401 refresh-retry  
10. Dead-letter queue retry UI  

---

## 9. Android readiness notes

| Item | Status |
|---|---|
| Package | `za.co.shalean.mobile` |
| Version | `0.1.0` |
| versionCode | starts at `1`; preview/production `autoIncrement` |
| Min/target SDK | From Expo SDK 53 prebuild (Android 7+ / current target) |
| Camera / photos | `expo-image-picker` + permissions |
| Notifications | plugin + `POST_NOTIFICATIONS` |
| Deep links | scheme `shalean://` |
| App Links | not verified yet (`autoVerify: false`) |
| Network security | HTTPS APIs only in beta; cleartext not enabled |
| Signing | Managed by EAS credentials on first build |

---

## 10. Collecting feedback

Use the Phase 6 workflow: bug description + Diagnostics export + optional screenshot → support owner same business day for blockers.
