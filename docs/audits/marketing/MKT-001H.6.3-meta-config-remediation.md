# MKT-001H.6.3 — Meta Configuration Remediation (staging)

**Date:** 2026-07-18  
**Target:** staging only — Meta app **Shalean Social Publishing** (`…5561`), Business (`…5220`)  
**Production / `main`:** **NO-GO**

---

## Decision

**NO-GO** for Facebook/Instagram Connected Accounts until operator completes Meta Advanced Access data-handling + account verification, staging env config IDs are updated, and one controlled Connect retest passes.

Configs and Page ownership work completed in this session; runtime Connect tests were **not** run (blocked on Advanced Access + Vercel env update).

---

## Actions completed (this session)

| # | Action | Result |
| --- | --- | --- |
| 1 | Set Meta app Live | **PASS** — Alerts: “switched to live mode” (~minute ago). Header Live switch `aria-checked=true` after toggle. |
| 2 | Refresh / confirm Live | **CONDITIONAL** — Alerts confirm Live; LfB Settings later still shows Advanced Access banner (Live alone insufficient). |
| 3 | Advanced Access `public_profile` | **BLOCKED** — Usage check completed; **Data handling questions** require legal entity answers (stopped per governance). |
| 4 | App Review / verification prep | Started; incomplete without data-handling submit. |
| 5–6 | Create **General** LfB config (User token) | **PASS** — Name `Shalean Staging FB Pages`, ID masked **`…7795`**, permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. |
| 7–8 | Create **Instagram Graph API** LfB config (User token) | **PASS** — Name `Shalean Staging IG Graph`, ID masked **`…1441`**, permissions include `instagram_basic`, `instagram_content_publish`, `pages_read_user_content` (+ auto deps; 4 selected). |
| 9 | Confirm Page control | **PASS** — Page `Shalean Cleaning Services` / `1028…5418` owned by business **Shalean Cleaning Services**; Primary business page; Full access: operator (Farai Chits). |
| 10–11 | Link Instagram Professional + confirm asset | **BLOCKED** — Business Suite modal: **“Verification needed” → Verify account** (operator identity / 2FA). Could not open Instagram accounts / Connected assets. |
| 12–15 | Vercel staging env + redeploy | **BLOCKED** — Cursor Vercel browser not logged into `shalean-cleaning-services`; CLI scope is personal team only; Vercel MCP has no env-write tool. |
| 16–19 | Facebook / Instagram Connect tests | **NOT RUN** — blocked on Advanced Access + env IDs. |
| 20–21 | Audit doc | This file. |

---

## New Login for Business configuration IDs (masked)

| Purpose | Name | Variation | Token | Masked ID | Staging env var |
| --- | --- | --- | --- | --- | --- |
| Facebook Pages | Shalean Staging FB Pages | **General** | User | `…7795` | `FACEBOOK_LOGIN_CONFIG_ID` |
| Instagram Graph | Shalean Staging IG Graph | **Instagram Graph API** | User | `…1441` | `INSTAGRAM_LOGIN_CONFIG_ID` |

Legacy (do not use for Facebook purpose):

| Name | Variation | Masked ID | Note |
| --- | --- | --- | --- |
| Shalean Staging Social | Instagram Graph API | `…1207` | Was incorrectly used as Facebook General |

Full IDs (operator-only; do not paste into chat logs):

- Facebook General: `1826736154977795`
- Instagram Graph: `1951379258911441`

---

## Advanced Access / App Review status

| Item | Status |
| --- | --- |
| App Live (alert) | Confirmed once this session |
| LfB Settings banner | Still requires Advanced Access for `public_profile` |
| `public_profile` Advanced Access | **Incomplete** — Usage check OK; Data handling questionnaire pending |
| Page/Instagram permissions | Standard access (admin-role grantable) |
| Business Suite account verification | **Required** before asset linking UI |

---

## Page / Instagram linkage

| Asset | Status |
| --- | --- |
| Facebook Page `1028…5418` | Controlled by business `…5220`; Full access for operator |
| Instagram Professional linked to Page | **Unknown / blocked** by Meta “Verify account” modal |
| IG as business asset / Graph publish eligible | **Not confirmed** |

---

## Staging environment (required operator update)

Update **Preview / staging only** (not Production):

```text
FACEBOOK_LOGIN_CONFIG_ID=<full id ending …7795>
INSTAGRAM_LOGIN_CONFIG_ID=<full id ending …1441>
```

Then redeploy staging branch and record:

- Deployment ID
- Git SHA
- Health: masked config suffixes match `…7795` / `…1441`

Current staging deploy (pre-env-change): `dpl_4sifLvnpzVmDddJCbyWLMznEQBvn` @ `13a56558` READY.

---

## Operator actions required (exact)

### A. Complete Advanced Access data handling

1. Open [Permissions and Features](https://developers.facebook.com/apps/2474572869715561/app-review/permissions/?business_id=111050844825220)
2. Search `public_profile` → **Request advanced access**
3. Complete **Usage check** (agree checkbox) → **Confirm**
4. On **Data handling questions**, answer and **Submit**:
   - Data processors Yes/No (+ names if Yes)
   - Legal entity / data controller name
   - Country
   - National security disclosure (last 12 months)
   - Policies checklist
5. Reply in chat with: Advanced Access status for `public_profile` (Advanced / pending / rejected) — no legal prose needed unless Meta rejects.

### B. Meta Business Suite account verification

1. Open Business Settings → Pages → Shalean Cleaning Services  
2. When **Verification needed** appears → **Verify account**  
3. Complete password / 2FA / identity steps Meta shows  
4. Then: **Instagram accounts** → confirm Professional account present  
5. On Page → **Connected assets** / **Connect assets** → link the correct Instagram Professional to Page `102815532315418`  
6. Reply with: IG username (handle only) + “linked to Page” yes/no

### C. Vercel staging env + redeploy

1. Log into Vercel team **shalean-cleaning-services**  
2. Project **shalean-platform** → Settings → Environment Variables  
3. For **Preview** (staging branch only), set/replace:
   - `FACEBOOK_LOGIN_CONFIG_ID` = id ending `…7795`
   - `INSTAGRAM_LOGIN_CONFIG_ID` = id ending `…1441`
4. Redeploy staging (Deployments → … → Redeploy, or push empty commit to `staging` only if needed)  
5. Confirm READY; paste deployment ID + Git SHA (redacted if needed)

### D. After A–C: one Facebook Connect test (agent will run)

Expect authorize shape:

- `loginTokenType=user`
- `hasOverrideDefaultResponseType=false`
- `hasConfigId=true`
- `hasScope=false`
- `authType=null`
- config masked `…7795`

Then only if Facebook persists: one Instagram Connect/discovery test with `…1441`.

---

## Connect test results

| Test | Result |
| --- | --- |
| Facebook Connect | **NOT RUN** |
| Instagram Connect / discovery | **NOT RUN** |

---

## Remaining external blockers

1. Meta **data handling** legal questionnaire for Advanced Access `public_profile`
2. Meta Business Suite **Verify account** (operator identity)
3. Instagram Professional ↔ Page link confirmation
4. Vercel **staging** env update + redeploy (browser/CLI auth to shalean team)

---

## Governance

| Item | Decision |
| --- | --- |
| Facebook Connect | **NO-GO** |
| Instagram Connect | **NO-GO** |
| Production / `main` | **NO-GO** |
| Further Shalean OAuth code | **NO-GO** until Meta + staging env complete |
| Resume after operator A–C | **GO** |
