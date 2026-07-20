# MKT-001L — Legal & Privacy Review of Meta Compliance Routes

**Date:** 2026-07-20  
**PR:** [#71](https://github.com/shalean-developer/shalean-platform/pull/71)  
**Reviewed head (pre-remediation):** `b22eb7a05e67bda74cd824c8a699d5dbcfaedac5`  
**Remediation head (post-fix, CI green):** `622305d717de46903de144fb53224d68e041758a`  
**Remediation branch:** `staging`  
**Constraint:** No Meta dashboard, production Vercel vars, Supabase production, or provider-flag changes.  
**Nature:** Preliminary Legal & Compliance Engineering review — **not** a substitute for qualified South African legal counsel.

---

## Legal gate outcome

### **CONDITIONAL PASS**

Compliance endpoints are **ready for a production foundation release with all provider flags disabled**, subject to the open findings below. Enabling Meta Live / Facebook–Instagram providers remains **NO-GO** until counsel sign-off, durable deletion-request accountability, defined retention controls, and operator completion evidence are closed.

---

## 1. Sources reviewed

| Source | Authority class | Use |
|---|---|---|
| Protection of Personal Information Act 4 of 2013 (POPIA), incl. Conditions for lawful processing / s18 openness | **Binding SA law** | Privacy-notice and processing inventory |
| Information Regulator (SA) complaints guidance — [inforegulator.org.za/complaints](https://inforegulator.org.za/complaints/), POPIAComplaints@inforegulator.org.za | **Regulator guidance / statutory process** | Complaint escalation wording |
| Meta Developer Docs — [Data Deletion Request Callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/) | **Meta platform / contractual requirement** | Callback HTTPS, `signed_request`, JSON `{ url, confirmation_code }`, status explanation |
| Meta Platform Terms §3(d) (data deletion) as referenced in Meta developer materials | **Meta contractual** | Obligation to initiate deletion / provide status |
| Shalean implementation on PR #71 head + remediation commits | **Application behaviour** | Consistency checks |
| Prior engineering note MKT-001K compliance endpoint matrix | **Internal** | Route inventory |

---

## 2. Processing inventory (actual behaviour)

| Item | Processed / stored? | Location / notes | Personal information? |
|---|---|---|---|
| Facebook Page identifiers | Yes | `social_accounts.account_id` / metadata (plaintext) | Provider/business identifier; may identify a person for sole-trader Pages |
| Instagram business account identifiers | Yes | `social_accounts.account_id` / metadata | Same |
| Display / account names | Yes | `account_name`, metadata | Often personal or business name |
| Access / refresh tokens | Yes | Encrypted envelopes in `access_token` / `refresh_token` | Credential; highly sensitive |
| Encrypted token envelopes | Yes | AES-GCM `v2:` via marketing OAuth keyring | Ciphertext of tokens |
| Expiry timestamps | Partial | `expires_at` (FB); IG forced null | Not PI alone |
| Connection status / health | Yes | `status`, `health`, metadata errors | Operational |
| Publishing history | Yes | `social_publish_history`, jobs, idempotency ledger | Campaign metadata + admin actor; not booking customer PI |
| Provider post / media IDs | Yes | `response_id` / `external_post_id` | Provider identifiers |
| Administrator identity / email | Yes | `connected_by`, `published_by` | **Yes — personal information** |
| OAuth state / correlation | Ephemeral | Hashed state cookie, correlation id, redacted logs | Correlation; admin email in some logs |
| Deletion-request records | Console audit only (no DB table) | `[meta-data-deletion] request_ack` with `userHash` | Hash of Meta user id |
| Confirmation / status codes | Stateless HMAC | `nonce.issuedAt.mac`; status URL `?code=` | Non-identifying if secret held |
| Meta app-scoped user id | Hash only (post-remediation) | `metadata.metaUserIdHash` on Facebook connect | Hash of PI |
| Customer booking PI on social path | **No** | Bookings/payments are separate systems | N/A on this path |

**Important:** Administrator email and provider identity fields **are** personal information. Do not claim “no personal information is processed” for the Marketing Hub / Meta path.

---

## 3. Privacy-policy findings

| ID | Requirement / source | Current implementation (pre-fix) | Gap | Legal / privacy impact | Required correction | Owner | Closure evidence | Release-blocking? |
|---|---|---|---|---|---|---|---|---|
| L-PRIV-001 | POPIA s18 — responsible party identity | Brand name only | Missing registered entity / address | Openness incomplete | State trading name + contacts; flag entity particulars for counsel | Legal + Eng | Updated `/privacy-policy` + counsel confirmation of entity block | **Conditional** (foundation OK; Live/counsel before claiming full POPIA notice) |
| L-PRIV-002 | POPIA s18 — contact | Support + hello emails present | OK after remediation | Low | Keep | Eng | Page copy | No |
| L-PRIV-003 | Categories of information | Booking-only categories | Omitted social/admin PI | Material under-disclosure vs actual processing | Disclose admin + social categories | Eng | Updated policy | **Yes for Live Meta**; remediated for foundation |
| L-PRIV-004 | Purpose / justification | Booking purposes only | Social purpose missing; lawful bases not counsel-confirmed | Under-disclosure | Add social purpose; counsel to confirm bases | Eng + Legal | Policy + counsel memo | Conditional |
| L-PRIV-005 | Social integrations | Absent | Contradicted actual Marketing Hub | Meta App Review + POPIA openness | Disclose Meta connect/publish | Eng | Policy §4 | **Yes for App Review / Live** — remediated in copy |
| L-PRIV-006 | Operators | Absent | Incomplete | Operator transparency | Name hosting/DB/payments/Meta classes | Eng | Policy §5 | Conditional |
| L-PRIV-007 | Cross-border | Absent | Likely US processors | s72 transfer awareness | Disclose may process outside SA; counsel inventory | Eng + Legal | Policy §6 + counsel | Conditional |
| L-PRIV-008 | Security | Weak generic | Did not reflect token encryption / callback HMAC | Understates controls | Document applied controls accurately | Eng | Policy §7 | No (improved) |
| L-PRIV-009 | Retention | “As needed” only | **Undefined calendar periods** | Control gap — do not invent periods | Publish when ops+counsel define; keep gap explicit | Ops + Legal | Retention schedule | **Open control gap** — not invented |
| L-PRIV-010 | Data-subject rights | Absent | POPIA rights missing | Material | Add access/correction/deletion/objection path | Eng | Policy §9 | Remediated in copy |
| L-PRIV-011 | Complaints / Regulator | Absent | Missing IR path | s18 / guidance | Link IR complaints + POPIA email | Eng | Policy §10 | Remediated |
| L-PRIV-012 | Cookies / sessions | Absent | OAuth/session cookies used | Openness gap | Disclose essential cookies + OAuth CSRF | Eng | Policy §11 | Remediated |
| L-PRIV-013 | Effective date / changes | Absent | No versioning | Clarity | Add effective date + change clause | Eng | Policy header | Remediated |
| L-PRIV-014 | Consistency with app / Meta | Policy ignored social | Contradiction | Trust / App Review | Align policy with inventory | Eng | Policy + inventory | Remediated in copy |

---

## 4. Data-deletion findings

| ID | Requirement / source | Implementation | Gap | Impact | Correction | Owner | Closure evidence | Blocking? |
|---|---|---|---|---|---|---|---|---|
| L-DEL-001 | Distinguish credential vs customer delete | Instructions + status say ack ≠ auto customer wipe | Pre-fix omitted publishing history | Over-promise risk | Explicit publishing-history exception | Eng | `/data-deletion` copy | Remediated |
| L-DEL-002 | Ack ≠ completion | Status: “Request acknowledged” | Pre-fix OK; strengthened | Meta + user clarity | “pending operator completion” | Eng | Status page | Remediated |
| L-DEL-003 | Identity verification | Email path asks for Page name | Soft verification only | Impersonation risk on email path | Operator SOP for verify | Ops | Runbook | Conditional |
| L-DEL-004 | Timelines | None | No SLA; Meta expects status explanation | Ambiguity | “as soon as practicable after verification” — no false SLA | Eng | Copy | Remediated |
| L-DEL-005 | Durable request record | Console only | Logs rotate; no accountable ticket | Operator may miss requests | Add DB ledger (migration) before Live | Eng + Ops | Migration + UI/ops | **Open — Live blocking** |
| L-DEL-006 | Map Meta `user_id` → rows | Pre-fix: no mapping | Could not locate connection from callback | Cannot complete Meta deletion reliably | Store `metaUserIdHash` on connect | Eng | OAuth save + hash | Remediated for future connects |
| L-DEL-007 | Rate / abuse protection | None pre-fix | Unsigned flood / cost | Availability | IP window 429 | Eng | Limiter + tests | Remediated |
| L-DEL-008 | Completion evidence | Manual only | No checklist in product | False “done” risk | Operator SOP: verify DB wipe | Ops | Runbook | Open ops |
| L-DEL-009 | Invalid signatures fail closed | HMAC timing-safe | OK | — | Keep; reject bad algorithm | Eng | Tests | Pass |
| L-DEL-010 | Secret / PII in logs/URLs | No raw user id in response; hashed audit | confirmationCode logged (intentional) | Low | Do not log `signed_request` | Eng | Code review | Pass |
| L-DEL-011 | Replay / duplicate | New code per POST | No durable dedupe | Multiple acks OK for Meta | Document; ledger later | Eng | Docs | Conditional |

---

## 5. Meta callback findings

| ID | Requirement | Status |
|---|---|---|
| L-META-001 | JSON `{ url, confirmation_code }` | **Pass** |
| L-META-002 | HTTPS public callback, no auth for Meta | **Pass** (route is public POST) |
| L-META-003 | Verify `signed_request` with app secret | **Pass** (fail-closed; secret server-side only) |
| L-META-004 | Status URL human-readable | **Pass** |
| L-META-005 | Initiate deletion | **Conditional** — ack + operator queue; not auto-delete (acceptable for foundation; Live needs durable queue + completion) |
| L-META-006 | App Review evidence | Privacy URL, data-deletion instructions URL, callback URL, screencast of request→ack→status; Advanced Access still required for publish perms (see MKT-001K) |

**Dashboard prepare (do not apply in this task):**

- Privacy Policy URL → `https://shalean.co.za/privacy-policy`
- Data Deletion Request URL → `https://shalean.co.za/api/meta/data-deletion`
- User instructions → `https://shalean.co.za/data-deletion`

---

## 6. Required wording / code changes (this remediation)

Implemented on `staging` (see commit SHA after push):

1. Expanded `/privacy-policy` with POPIA-oriented sections aligned to actual processing (no invented retention periods).
2. Clarified `/data-deletion` and `/data-deletion/status` (ack vs completion; publishing history; escalation).
3. Callback: IP rate limit (429); algorithm fail-closed; operator-oriented audit fields.
4. OAuth connect: fetch `/me` id → store `metadata.metaUserIdHash` only.
5. CI route validator asserts privacy/social disclosure and deletion-scope copy.

---

## 7. External-counsel questions

1. Confirm registered responsible-party legal name, registration number, and address for the privacy notice.
2. Confirm POPIA lawful bases for (a) booking PI, (b) admin email on social connect, (c) provider account identifiers.
3. Approve cross-border transfer mechanism inventory (Vercel, Supabase, Meta, Paystack).
4. Set calendar retention periods for bookings, social credentials, publish history, and deletion-request audit logs.
5. Confirm whether publishing history must be erased on Meta user deletion requests or may be retained under a documented exception.
6. Confirm Information Officer designation / registration status with the Information Regulator.
7. Approve final Meta App Review privacy/data-deletion wording before Live.

---

## 8. Foundation release readiness (providers disabled)

| Question | Answer |
|---|---|
| Compliance endpoints ready for production **foundation** deploy with all provider flags off? | **Yes — CONDITIONAL PASS** |
| Ready to enable Facebook/Instagram providers or Meta Live? | **No** |
| Merge/deploy production authorized by this review? | **No** — out of scope; wait for explicit promotion approval |

---

## 9. Closure checklist (remaining for Live)

- [ ] Counsel answers §7  
- [ ] Durable `data_deletion_requests` (or equivalent) migration + operator workflow  
- [ ] Retention schedule published  
- [ ] Operator completion evidence SOP exercised on staging  
- [ ] Meta dashboard URLs set only after production HTTPS of this SHA  
- [ ] Provider flags remain `0` until separate production gate  
