# MKT-001H.6.2 — Meta Login for Business Configuration Audit

**Date:** 2026-07-18  
**Target:** staging Meta app **Shalean Social Publishing** (`…5561`)  
**Production / `main` / Shalean code:** **NO-GO** for further app changes

---

## Decision update

PR #69 authorize-shape fix **is live and verified in runtime**, but Meta Business Extension still fails. The authorize-shape defect is therefore **insufficient** as the remaining root cause.

**Remediation progress (same day):** see `MKT-001H.6.3-meta-config-remediation.md` — new General config `…7795` + Instagram Graph config `…1441` created; Advanced Access / IG link / staging env still blocked on operator actions.

### Live Meta dashboard inspection (2026-07-18, Cursor browser session)

App **Shalean Social Publishing** `2474572869715561`, Business `111050844825220`.

| Setting | Observed (pre-remediation) | After H.6.3 |
| --- | --- | --- |
| App Mode (header) | **Development** (Live switch = off) | Live toggled; alert “switched to live mode” |
| Alerts inbox | “switched to **live** mode” ~2h ago — then mode is Development again | Fresh Live alert recorded |
| LfB Settings banner | **“Facebook Login for Business requires advanced access…”** | **Still present** until Advanced Access completes |
| Valid OAuth Redirect URI | Staging callback present (correct) | Unchanged / correct |
| Client / Web OAuth | Enabled | Unchanged |
| Configurations listed | **Only one:** `Shalean Staging Social` / `…1207` | **Three:** `…1207` (IG), **`…7795` (General)**, **`…1441` (IG Graph)** |
| Config `…4849` | **Not present** on this app | Still absent (replaced by `…1441`) |
| Config `…1207` login variation | **Instagram Graph API** (not General) — locked | Unchanged (legacy) |
| Page in Business | Full access: 1 person | Confirmed Primary business page + Full access |
| `public_profile` | Standard — Verification required for Advanced | Advanced request **blocked on data-handling questionnaire** |

| Gate | Status |
| --- | --- |
| Post-merge deploy | `dpl_4sifLvnpzVmDddJCbyWLMznEQBvn` @ `13a56558` **READY** |
| Authorize shape after #69 | **PASS** (`loginTokenType=user`, `hasOverrideDefaultResponseType=false`) |
| Meta BE completion | **FAIL** |
| Shalean callback with usable `code` | **FAIL** |
| Further Shalean code changes | **NO-GO** |
| Next workstream | **Meta Login config / assets / App Review audit** |

---

## Post-merge runtime evidence (redacted)

### Authorize shape confirmed correct

Latest starts on the fixed deploy (examples):

| Time (UTC) | Correlation | Shape |
| --- | --- | --- |
| 07:04:02 | `fb-oauth-4b7db399-…` | `loginTokenType=user`, `hasOverrideDefaultResponseType=false`, `hasConfigId=true`, `hasScope=false`, `authType=null`, config `…1207`, app `…5561`, SHA `13a56558` |
| 07:01:57 | `fb-oauth-4b9cb7e4-…` | same |
| 06:54:19 | `fb-oauth-808f2ab9-…` | same |

### Two Meta failure modes still observed

| Mode | Evidence | Interpretation |
| --- | --- | --- |
| A. BE strand | Screenshot: `facebook.com/facebook_business_extension/oauth/?code=…` then Meta error page; often **no** Shalean callback | Meta generates intermediate code then crashes inside BE |
| B. Permissions deny | Callback `07:01:32` for `fb-oauth-808f2ab9-…`: `access_denied`, `error_code=200`, description length 17, `hasStateCookie=true` | Meta redirects with Permissions error after BE path |

Cookie attach fix from #69 is working when Meta does redirect (`hasStateCookie=true` on 07:01:32).

---

## Meta dashboard checklist (operator / Cursor with Meta session)

Inspect **Facebook Login for Business → Configurations → General (`…1207`)** on app `…5561`:

### Configuration identity

- [ ] Configuration ID suffix is **`…1207`** (not a deleted Marketing/Hub config)
- [ ] Belongs to app **Shalean Social Publishing** (`…5561`)
- [ ] Status = **Active**
- [ ] Token type = **User access token** (not System User)
- [ ] Login variation = expected General / Facebook Pages (not Instagram Graph — that is `…4849`)

### Assets

- [ ] Facebook Page (Shalean) is **selected / assigned** to this configuration
- [ ] Page appears as selectable during the BE onboarding UI
- [ ] No orphaned Business / Page ownership conflict (Page under expected Business portfolio)

### Permissions on the configuration

Confirm these (or the config’s actual listed set) are attached and grantable for Live:

- [ ] `pages_show_list`
- [ ] `pages_read_engagement`
- [ ] `pages_manage_posts`
- [ ] At least one non–`email`/`public_profile` business permission (Meta LfB requirement)

### App Review / access level

- [ ] `public_profile` has **Advanced Access** (Meta FAQ requirement for Live LfB)
- [ ] Page permissions above have Standard or Advanced Access as required for the admin user granting own assets
- [ ] No permission stuck in “not available” / rejected review

### Roles

- [ ] Operator Facebook profile has **Full control** of the Page
- [ ] Same profile is App Admin / Developer on `…5561`
- [ ] Same profile has adequate role on the Business portfolio that owns the Page

### OAuth settings (app-level)

- [ ] Valid OAuth Redirect URI exact:  
  `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/facebook/callback`
- [ ] Client OAuth Login = enabled  
- [ ] Web OAuth Login = enabled  
- [ ] App Domains include the staging host

### Instagram Graph config (`…4849`) — defer until Facebook PASS

- [ ] Active, User token, IG Professional + Page assets  
- [ ] Do not retest until General `…1207` Completes

---

## Business Extension error URL capture (operator)

When the Meta error page appears, copy the address bar and redact values. Report **keys only** (and whether present):

```text
host: facebook.com
path: /facebook_business_extension/oauth/
keys: code?, config_id?, asset_id?, business_id?, error?, error_code?, error_subcode?, error_message?, state?, redirect_uri?, app_id?, extras?
codeLength: <number only>
```

Do **not** paste full `code=` values into chat.

---

## Exact remaining blockers (from live inspection)

1. **App is currently in Development mode** (despite an alert that Live was enabled ~2h ago — mode was reverted or never stuck).
2. **`public_profile` is Standard access only** — Meta banner requires Advanced Access for Facebook Login for Business.
3. **Config identity mismatch:** staging `FACEBOOK_LOGIN_CONFIG_ID` (`…1207` / “Shalean Staging Social”) is an **Instagram Graph API** login variation, not General — yet Connect Facebook uses it for Page connect.
4. **Config `…4849` does not exist** on this app’s Configurations list (stale Vercel env for Instagram).
5. Business Suite shows **Connect Instagram** / verification prompts — Instagram professional linkage may be incomplete at Business level.
6. Page `102815532315418` exists with Full access for 1 person (good).

**Operator Meta fixes (no Shalean code):**

1. Toggle app **Live** and confirm header stays “App Mode: Live”.
2. Complete verification / **Get Advanced Access** for `public_profile` (banner CTA).
3. Create a **General** Login for Business config (User token) with Page publishing permissions; put that ID in `FACEBOOK_LOGIN_CONFIG_ID`.
4. Create/confirm a separate **Instagram Graph API** config; put that ID in `INSTAGRAM_LOGIN_CONFIG_ID` (replace orphan `…4849`).
5. Confirm Instagram professional account linked to Page `1028…` in Business Suite.
6. Only then one Connect Facebook retest — no further Shalean OAuth code changes.

## Escalation rule

If the checklist above is confirmed green (User token, Active, **true General** config, Full Control, Advanced Access `public_profile`, correct redirect, app **stays Live**) and BE still strands with intermediate `code=` and no usable Shalean redirect, open a **Meta Developer Support** case for Login for Business / Business Extension grant failure, citing:

- App Live + User-shaped authorize (`config_id`, no scope, no auth_type, no override)
- Intermediate code on BE host then crash
- Alternate callback path returns `access_denied` / `error_code=200` / “Permissions error”
- Graph Explorer `/me/accounts` works on same app (different auth path)

---

## Governance

| Item | Decision |
| --- | --- |
| Further Shalean OAuth code patches | **NO-GO** until Meta config audit completes |
| Facebook Connect PASS | **NO-GO** |
| Instagram Connect PASS | **NO-GO** |
| Production / `main` | **NO-GO** |
| Meta config audit | **GO** |
