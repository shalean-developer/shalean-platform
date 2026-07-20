# MKT-001H.6.3 — Meta Configuration Remediation (staging)

**Date:** 2026-07-18  
**Target:** staging only — Meta app **Shalean Social Publishing** (`…5561`), Business (`…5220`)  
**Production / `main`:** **NO-GO**  
**Superseding note (MKT-001I):** Facebook Connected Accounts + publishing are now **PASS** on staging. Instagram remains blocked on Meta asset verification / linkage.

---

## Decision

**Facebook Connected Accounts: PASS** (staging).  
**Instagram: pending / NO-GO** until Professional account is linked and discovery/publish succeed.  
**Production / `main`: NO-GO.**

Staging env config IDs and redeploy completed earlier; Facebook OAuth + encrypted persist + real Page publish proven via staging DB (see MKT-001I §2).

---

## Actions completed (this session + prior)

| # | Action | Result |
| --- | --- | --- |
| 1 | Set Meta app Live | **PASS** |
| 5–6 | Create **General** LfB config (User token) | **PASS** — `…7795` |
| 7–8 | Create **Instagram Graph API** LfB config (User token) | **PASS** — `…1441` |
| 9 | Confirm Page control | **PASS** — Page `1028…5418` |
| 10–11 | Link Instagram Professional + confirm asset | **BLOCKED** — Business Suite “Verification needed”; Instagram accounts list empty |
| 12–15 | Vercel staging env + redeploy | **PASS** — configs `…7795` / `…1441`, deploy `dpl_EhpJnyYeSZnEBnMdtf49kkFioTMC` @ `7c79a066` |
| 16–19 | Facebook Connect + publish | **PASS** — see evidence below |
| 16–19 | Instagram Connect / discovery | **NOT RUN / BLOCKED** — no IG business asset |

---

## Facebook PASS evidence (redacted)

| Stage | Result |
| --- | --- |
| Authorization code | Received (callback progressed) |
| Token exchange | Succeeded |
| Page discovery | Page `102815532315418` / Shalean Cleaning Services |
| Encrypted persistence | `social_accounts` row `encrypted_v2`, `status=connected`, `health=healthy` |
| Publish | `social_publish_history.response_id=102815532315418_1074436751809475` @ 2026-07-18 07:56:37Z |
| Ledger | `marketing_publish_idempotency` succeeded with same external post ID |

---

## New Login for Business configuration IDs (masked)

| Purpose | Name | Variation | Token | Masked ID | Staging env var |
| --- | --- | --- | --- | --- | --- |
| Facebook Pages | Shalean Staging FB Pages | **General** | User | `…7795` | `FACEBOOK_LOGIN_CONFIG_ID` |
| Instagram Graph | Shalean Staging IG Graph | **Instagram Graph API** | User | `…1441` | `INSTAGRAM_LOGIN_CONFIG_ID` |

---

## Operator actions still required (Instagram)

1. Complete Meta Business Suite **Verify account** (password / 2FA / identity as Meta prompts).
2. **Instagram accounts** → add the Shalean Professional account to business `…5220`.
3. Page `102815532315418` → **Connected assets** → link that Instagram Professional.
4. Reply with IG username (handle only) + “linked to Page” yes/no.
5. Agent will then run **one** Instagram discovery + one controlled staging publish.

---

## Governance

| Item | Decision |
| --- | --- |
| Facebook Connect | **PASS** |
| Facebook publishing | **PASS** |
| Instagram Connect | **NO-GO** (pending) |
| Production / `main` | **NO-GO** |
| Staging env / redeploy | **PASS** |
| Continue in MKT-001I | Instagram / X / GBP |
