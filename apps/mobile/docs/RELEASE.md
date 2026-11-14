# Shalean Cleaner — Release & EAS documentation

## Separate Samsung test APK — November 2026

The existing installed Shalean Cleaner is version 0.1.0 and must not be replaced until the original Android signing certificate is verified.

- Preview package: `za.co.shalean.cleaner.preview`; production package remains `za.co.shalean.mobile`.
- Existing configured Expo owner/project remain unchanged for production.
- Preview requires `EXPO_PUBLIC_PREVIEW_EAS_OWNER` and `EXPO_PUBLIC_PREVIEW_EAS_PROJECT_ID` pointing to the tester-controlled Expo project. The project displayed by the owner is owner `shaleancleaning`, ID `12cb55b1-12f6-464e-86df-4a0220ac2cf9`; verify project ownership and access before configuring.
- Preview also requires HTTPS `EXPO_PUBLIC_API_BASE_URL` pointing to staging, plus matching Supabase URL and anon key in the Expo preview environment. The build rejects a missing API URL or the live Shalean domain.
- GitHub Actions manual build requires an authorized `EXPO_TOKEN` repository secret and signing setup in the selected Expo project. Never paste this token into issues, PRs, screenshots, or chat.
- Preview package identity is independent; installing it will not update the original package or prove production signing compatibility.
- Do not launch real messages, payments, or customer operations during testing.
- Before sharing an APK, verify a finished EAS build, correct project ID, Android package, staging API, signing, and downloadable artifact.


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

## Local Android build — $0 GitHub Actions budget

Use `npm ci` from `apps/mobile` on a machine with Node, JDK 17+, and the
Android SDK. Do not copy partial `node_modules` trees between machines: a clean
install supplies the compiled `expo-modules-autolinking/build` entry point.

Configure the approved staging values in a gitignored `.env`:
`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_BUILD_NUMBER` (a positive,
increasing Android version code). Set `ANDROID_HOME` to the installed SDK.
Run `npm run android:preview:local` from `apps/mobile`.

The script runs typecheck/lint, generates Android, and assembles a standalone
release APK locally. It forces the preview package, validates the staging API,
and disables OTA updates for this local binary. It requires no Expo project
access, EAS build, token, or GitHub Actions run. Never use privileged Supabase keys.
The output is `android/app/build/outputs/apk/release/app-release.apk`.
The generated project uses local test signing; preserve that key securely for
future updates, and compare its certificate to the installed preview before
attempting an update. This does not establish production signing compatibility.

When updating this PR under the zero Actions budget, include `[skip ci]` in
**every commit message** to suppress automatic push/pull_request workflows. Do
not manually dispatch or rerun workflows. A skipped CI check is not a pass; use
local evidence and keep the PR draft until native and device acceptance pass.
Local preview also omits the EAS project ID and disables push-device registration;
remote push delivery requires a separately configured EAS preview build.
If Gradle reports `JAVA_COMPILER` missing, the selected Java installation is a
runtime rather than a full JDK. Set `JAVA_HOME` to a full JDK 17 installation;
the local build script checks for `bin/javac` before generation or compilation.
Local preview limits Metro and Gradle to one worker and Gradle's heap to 1536 MiB
to reduce peak memory during release bundling. Other build modes keep their
existing settings. A disappearing daemon is not proof of a source error; retain
the build log and check memory/toolchain diagnostics before changing dependencies.
The local-only Gradle init script also caps Ninja C++ compile/link jobs through
CMake job pools. Gradle's `--max-workers` alone does not bound Ninja concurrency.

## Separate local staging identity — Build 5

Build 4 was rejected by the owner's phone with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`:
the installed `za.co.shalean.cleaner.preview` certificate differs from local test signing.
Do not uninstall it or disable signature verification to install a local build.

Local preview builds now use `za.co.shalean.cleaner.staging`, display name
**Shalean Cleaner Staging**, and scheme `shalean-cleaner-staging`. They install
alongside the EAS preview, with independent local storage and sign-in. The EAS
preview and production identities retain their existing package names and schemes.
Build 5 uses version code 5. Push registration and OTA remain disabled locally.
An update of the original preview requires its original signing key instead.
