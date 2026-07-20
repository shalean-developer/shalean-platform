# MKT-001 — Meta Production Release Assessment

**Project:** Shalean Cleaning Services  
**Program:** Marketing Platform Remediation  
**Document:** Provider-scoped production release assessment  
**Date:** 2026-07-17  
**Base branch:** `staging`  
**Exact staging SHA (assessment baseline):** `bf31401423b94e0d301800bb4be2a1613fa8ef85`  
**Related phases:** MKT-001A → MKT-001F (platform foundation); proposed **MKT-001G** (Meta provider production readiness)  
**Release manifest:** `docs/releases/marketing-provider-release-manifest.md`  
**Type:** Release governance — assessment and decision record  

---

## 1. Executive decision

| Scope | Decision |
|---|---|
| Shared marketing platform (security, queue, ledger, intelligence, UX) | **GO to prepare** for a controlled production release |
| Facebook | **GO to prepare** for production independently |
| Instagram | **GO to implement and verify next** (not required to ship Facebook) |
| Google Business Profile (GBP) | **NO-GO** until MKT-001A-PROD closes — provider-isolated only |
| LinkedIn / Pinterest / X | **NO-GO** — stubs remain disabled until separately implemented |

**Governance revision (authoritative for this assessment):**

> **GBP production remains NO-GO until MKT-001A-PROD closes. The broader marketing platform may proceed through a provider-scoped production assessment, with GBP disabled and independently gated.**

This supersedes the earlier blanket rule that production remained NO-GO for the entire marketing platform until MKT-001A-PROD closed. GBP must no longer block Facebook (or a later Instagram) release, provided GBP cannot be selected, connected for publish, or executed by the queue.

**Flag policy (hard requirement before production authorize):** providers are **disabled unless explicitly enabled**. Forgetting an environment variable must not expose an unfinished provider. Enforcement is server-side via `ProviderRegistry.requireEnabled` / `isProviderFeatureEnabled` (fail-closed defaults).

**Do not promote the whole staging branch blindly.** Ship a controlled release containing the verified shared platform and only providers that have individually passed production gates. Record each promote in the provider-release manifest.

---

## 1b. Roadmap status

| Phase | Status |
|---|---|
| MKT-001A | ✅ Complete through staging (production blocker isolated to GBP) |
| MKT-001B | ✅ Complete |
| MKT-001B.2 Slice 1 | ✅ Complete |
| MKT-001C | ✅ Complete |
| MKT-001D | ✅ Complete |
| MKT-001E | ✅ Complete |
| MKT-001F | ✅ Complete |
| Fail-closed provider defaults | ✅ Implemented (`DEFAULT_ENABLED` all `false`) |
| Provider-release manifest | ✅ `docs/releases/marketing-provider-release-manifest.md` |
| MKT-001G — Instagram / Meta Provider Readiness | ▶️ **In progress** on `feature/mkt-001g-meta-provider-readiness` |

Then: complete MKT-001G → verify Facebook production readiness → verify Instagram production readiness → keep GBP disabled → update assessment + manifest → controlled production SHA with approved providers only → GBP later after Google approval.

---

## 1c. PASS — Provider-scoped release controls hardened

**Date:** 2026-07-17  
**Verdict:** **PASS**

Both required pre-authorization adjustments are complete and aligned with the production governance model.

| Control | Result |
|---|---|
| Provider defaults | **Fail-closed** |
| Facebook auto-enable risk | **Removed** |
| GBP auto-enable risk | **Removed** |
| Stub provider auto-enable risk | **Removed** |
| Server-side enforcement | **Preserved via `requireEnabled`** |
| Worker enforcement | **Preserved** |
| Tests | **Updated and passing** |
| Environment documentation | **Updated** |
| Provider release manifest | **Created** |
| Architecture and campaign docs | **Updated** |

**Staging operational note:** `MARKETING_PROVIDER_FACEBOOK=1` must be explicitly configured for Facebook testing. GBP must remain unset or disabled unless a deliberate staging test is being performed.

### Current release posture

| Scope | Status |
|---|---|
| Shared marketing platform | **Ready for provider-scoped production preparation** |
| Facebook | **Pending controlled production gate** |
| Instagram | **Pending MKT-001G** |
| Google Business Profile | **Disabled; independent NO-GO** |
| LinkedIn / Pinterest / X | **Disabled** |
| Full production authorization | **Not yet granted** |

### Authorized next sequence

1. Complete **MKT-001G — Meta Provider Readiness**.
2. Run the Facebook controlled-post gate.
3. Record approved providers and exact release SHA in the manifest.
4. Verify production environment flags before deployment.
5. Release only the controlled SHA.
6. Enable only providers that individually passed their production gates.
7. Keep GBP and all deferred providers disabled.

This resolves the accidental-provider-enablement risk and provides the release evidence needed for a controlled Meta-first production rollout.

---

## 2. Release model change

### Previous gate (retired)

> All marketing providers must be ready.

### Replacement gate

> Each provider must independently pass its own production-readiness gate.

| Provider | Recommended status | Production default (code) |
|---|---|---|
| Facebook | Prepare for production now | **Disabled** until gate PASS + `MARKETING_PROVIDER_FACEBOOK=1` |
| Instagram | Implement and verify next | **Disabled** until MKT-001G completes |
| Google Business Profile | Keep disabled pending Google approval | **Disabled** until MKT-001A-PROD closes |
| LinkedIn | Keep disabled until separately implemented | **Disabled** |
| Pinterest | Keep disabled until separately implemented | **Disabled** |
| X | Keep disabled until separately implemented | **Disabled** |

The marketing platform can therefore be promoted with **provider-level feature flags**. Unset flags stay off (fail-closed). GBP remains visibly unavailable and cannot be invoked until explicitly enabled after its gate.

---

## 3. Recommended production release options

### Option A — Safest: Facebook-only (recommended)

Release:

- marketing platform shell;
- Connected Accounts (Facebook path);
- Facebook publishing;
- durable queue, retries, and DLQ;
- analytics and intelligence;
- campaign / marketing UX.

Keep disabled:

- Instagram (until adapter + permissions pass);
- GBP (pending Google / MKT-001A-PROD);
- LinkedIn, Pinterest, X stubs.

This is the **lowest-risk** production release.

### Option B — Facebook + Instagram together

Use only when Instagram has:

- a complete adapter (not a stub);
- correct Meta permissions;
- staging connection evidence;
- real staging publish evidence;
- provider-specific retry and idempotency tests;
- production configuration verification.

**Do not delay a ready Facebook release solely to bundle Instagram.**

---

## 4. Shared platform gate

The shared platform (independent of any single network) must pass:

| Gate | Requirement | Foundation |
|---|---|---|
| Security | Encrypted token storage; no token/Graph leakage; OAuth CSRF; fail-closed | MKT-001A |
| Encryption | `v2:` envelopes; production key scoped correctly | MKT-001A / A-PROD ops |
| Queue | Durable jobs, lease, retries, DLQ | MKT-001B / B.2 |
| Idempotency | Fail-closed claim; duplicate-publish prevention | MKT-001B |
| Audit trail | Publish history + ledger + correlation IDs | MKT-001B / C |
| Error recovery | Classification, reconnect UX, DLQ recovery | MKT-001B / F |
| Intelligence | Monitoring, alerts, actionable findings | MKT-001E |
| Accessibility / UX | Registry-aware publish controls; disabled ≠ failed | MKT-001F |
| Exact-SHA deployment | Production deploy matches approved release SHA | Ops |
| Rollback readiness | Documented rollback to prior production SHA / flag kill-switch | Ops |

**Assessment baseline:** staging tip `bf314014` includes MKT-001A–F merge evidence. Platform gate remains subject to a dedicated pre-production checklist on the **release SHA**, not an assumption that “staging green” equals production GO.

---

## 5. Facebook production gate

Facebook already has the strongest foundation:

- active adapter (`facebookProvider` → Graph publish path);
- provider registry integration;
- encrypted token storage;
- publishing ledger;
- durable queue;
- retries and DLQ;
- operational history;
- intelligence monitoring;
- recovery UX.

### Facebook release checklist

| # | Control | Pass criteria |
|---|---|---|
| F1 | Production Meta app identity | Correct App ID / secret on Production env only |
| F2 | Callback URL | Production OAuth callback matches Meta app settings |
| F3 | Page connection | Real production Page connected and selectable |
| F4 | Page permissions | Required Page permissions granted and validated |
| F5 | Long-lived token handling | Exchange / persistence verified |
| F6 | Encrypted persistence | `social_accounts` row uses encrypted token envelope |
| F7 | Refresh / reconnect | Expired or revoked token surfaces reconnect path |
| F8 | Text-only post | Controlled production text publish succeeds |
| F9 | Image post | Controlled production image publish succeeds |
| F10 | Duplicate prevention | Replay / double-submit does not create a second post |
| F11 | Retry / DLQ | Induced failure reaches retry then DLQ correctly |
| F12 | History reconciliation | Ledger + `social_publish_history` match provider post ID |
| F13 | Revocation / expiry | Safe handling; no silent success; no secret leakage |
| F14 | Data hygiene | No tokens or raw Graph responses exposed to clients/logs |

**Exit rule:** Facebook is released only after a **real controlled post** succeeds from the production configuration (not preview-only evidence).

**Decision:** **GO to prepare** Facebook for production independently. Gate status at document time: **OPEN** (prep + operator smoke required).

---

## 6. Instagram — next engineering phase (MKT-001G)

Instagram is **not** merely another Facebook destination. It needs its own adapter and publishing lifecycle.

### Proposed phase

```text
MKT-001G — Meta Provider Production Readiness
```

| Item | Value |
|---|---|
| Branch | `feature/mkt-001g-meta-provider-readiness` |
| Base | `staging` |
| Scope | Instagram adapter + Meta production readiness evidence; Facebook production gate support |
| Production | May enable Instagram only after Instagram gate PASS; Facebook may ship earlier |

### Meta account and auth constraints

- Meta supports publishing for Instagram **Professional** accounts (Business or Creator) — not ordinary personal accounts.
- With the **Facebook Login** route, the Instagram professional account must be linked to a Facebook Page.
- Permissions commonly required: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.
- Meta distinguishes **Standard Access** (assets owned/managed by the app organization) from **Advanced Access** (serving external businesses).
- Publishing permissions and supported functionality differ between Instagram Login and Facebook Login. **Select one authentication model and document it** — do not mix both.

Reference materials: Meta Instagram API documentation (Postman / Meta developer docs).

### Connection and discovery (implementation scope)

- Discover the selected Facebook Page.
- Resolve the linked Instagram professional account.
- Reject personal Instagram accounts.
- Surface when no Instagram account is linked.
- Verify account permissions and capabilities.
- Store account IDs and tokens encrypted.
- Record token expiry and connection-health metadata.

### Publishing lifecycle

```text
Validate request
→ Create media container
→ Check container status when required
→ Publish container
→ Reconcile returned media ID
→ Record permalink and publish history
```

### Initial Instagram capabilities

| In scope (initial) | Deferred |
|---|---|
| Single-image feed post | Carousels |
| Caption | Reels |
| Publish status | Stories |
| Idempotency | Video transcoding |
| Retries + error classification | Product tagging |
| Audit trail + correlation ID | Collaboration posts |
| DLQ recovery | — |

### Instagram production gate

| # | Control | Pass criteria |
|---|---|---|
| I1 | Professional account discovered | Business/Creator resolved; personal rejected |
| I2 | Page linkage verified | IG account correctly linked to selected Page |
| I3 | Permissions approved | Required scopes present (app mode appropriate) |
| I4 | Image container created | Container API succeeds for allowed media |
| I5 | Publish succeeds | Controlled staging then production smoke |
| I6 | Media ID reconciled | External ID + permalink in history/ledger |
| I7 | Unsupported media rejected | Rejected **before** queueing |
| I8 | Retry idempotency | Retry does not create duplicate media |
| I9 | Token expiry / reconnect | Tested end-to-end |

**Decision:** **GO to implement and verify** Instagram next. Gate status: **NOT STARTED** (stub registered; `MARKETING_PROVIDER_INSTAGRAM` default off).

---

## 7. GBP isolation (decouple from combined release)

### GBP gate

| Item | Status |
|---|---|
| MKT-001A-PROD | **OPEN / NO-GO** |
| Blocks Facebook / Instagram / platform release? | **No** — provider-isolated |
| Production enablement | Forbidden until Google API approval + controlled smoke |

### Required production controls (server-enforced)

Repository convention (already implemented in `ProviderRegistry`):

```text
MARKETING_PROVIDER_<KEY>
```

Keys: `FACEBOOK`, `GOOGLE_BUSINESS`, `INSTAGRAM`, `LINKEDIN`, `PINTEREST`, `X`.

Recommended **production** values for a Facebook-first release:

```text
MARKETING_PROVIDER_FACEBOOK=1
MARKETING_PROVIDER_INSTAGRAM=0
MARKETING_PROVIDER_GOOGLE_BUSINESS=0
MARKETING_PROVIDER_LINKEDIN=0
MARKETING_PROVIDER_PINTEREST=0
MARKETING_PROVIDER_X=0
```

Acceptance values: `1|true|on|enabled` / `0|false|off|disabled`. **Unset = disabled** for every provider (fail-closed code defaults). Facebook is enabled only after its production gate passes and the flag is set explicitly. Omitting `MARKETING_PROVIDER_GOOGLE_BUSINESS` is sufficient to keep GBP off; setting `=0` is still recommended for operator clarity and the release manifest.

### When GBP is disabled, the system must

| Control | Enforcement |
|---|---|
| Not selectable for publishing | Registry + UX (`providerEnabled` / `classifyProviderUxState`) |
| OAuth Connect unavailable or clearly pending | Connect path blocked or marked pending approval — not “failed” |
| Queued GBP jobs must not execute | `requireEnabled` in job worker → non-retryable rejection / DLQ |
| No retry loop against Google | Disabled provider path sets `retryable: false` |
| Dashboard reports intentionally disabled | UX state `disabled` — not error/health failure |
| Historical GBP records remain readable | History / analytics read paths preserved |
| Later enablement requires controlled release | Env change + operator smoke + gate close |

**Do not rely only on hiding the button in the UI.** Publish routes and the durable worker already call `registry.requireEnabled(...)`.

### Known isolation evidence (code)

| Path | Behaviour when flag off |
|---|---|
| `runPublish` | `ProviderDisabledError` → HTTP 403, non-retryable |
| `executePublishJob` | Disabled → `dead_letter`, `retryable: false` |
| Publish routes | `requireEnabled` before provider I/O |
| Marketing UX | `disabled` / `provider_unavailable` empty states |

**Gap to close before production (engineering/ops):**

1. Confirm Production (and staging) env opt-in matches the intended matrix — Facebook only after gate PASS; GBP never enabled while MKT-001A-PROD is open.
2. Confirm OAuth connect for GBP is unavailable or labelled pending when disabled (not only publish).
3. Confirm intelligence does not treat intentional disable as `provider_disabled_unexpectedly` for GBP when the flag is the planned production posture.
4. Fill the first production entry in `docs/releases/marketing-provider-release-manifest.md` before promote.

---

## 8. Provider feature flags and environment variables

### Fail-closed policy

| Rule | Behaviour |
|---|---|
| Code default | All providers `false` |
| Explicit enable | `MARKETING_PROVIDER_<KEY>=1` (or true/on/enabled) |
| Explicit disable | `=0` / false / off / disabled, or unset |
| Enforcement | `requireEnabled` on publish routes and durable job worker |

### Feature flags (production matrix)

| Variable | Facebook-only release | After Instagram gate | After GBP gate |
|---|---|---|---|
| `MARKETING_PROVIDER_FACEBOOK` | `1` | `1` | `1` |
| `MARKETING_PROVIDER_INSTAGRAM` | unset/`0` | `1` | `1` |
| `MARKETING_PROVIDER_GOOGLE_BUSINESS` | unset/`0` | unset/`0` | `1` (post MKT-001A-PROD) |
| `MARKETING_PROVIDER_LINKEDIN` | unset/`0` | unset/`0` | unset/`0` |
| `MARKETING_PROVIDER_PINTEREST` | unset/`0` | unset/`0` | unset/`0` |
| `MARKETING_PROVIDER_X` | unset/`0` | unset/`0` | unset/`0` |

**Staging note:** after this fail-closed change, staging must set `MARKETING_PROVIDER_FACEBOOK=1` (and GBP only if intentionally testing) or those adapters will not publish.

### Other production env dependencies (non-exhaustive)

| Area | Variables / concerns |
|---|---|
| Meta / Facebook | App ID, App Secret, OAuth redirect URI, Page token path |
| Encryption | `MARKETING_OAUTH_ENCRYPTION_KEY` Production-scoped (MKT-001A-PROD R1 item) |
| Cron / queue | Cron secret for `process-social-publish-jobs` |
| Supabase | Production project identity; migrations applied |
| App env | `SHALEAN_APP_ENV` / deployment identity checks |

Exact names follow repository / Vercel inventory; values must be verified on the release SHA before GO.

---

## 9. Migrations

| Concern | Rule |
|---|---|
| Staging schema | Already carries MKT-001A–F marketing tables (ledger, history, jobs, accounts) |
| Production migrations | Apply only those required for the **shared platform + enabled providers** |
| GBP-specific schema | Historical tables may exist; GBP disable does not require dropping history |
| Instagram | Any new account/metadata columns ship with MKT-001G; no Instagram enable without migration + adapter |
| Rollback | Prefer flag kill-switch first; schema rollback only if a migration is unsafe |

No production migration solely to “wait for GBP.”

---

## 10. Meta permissions and app mode

| Topic | Production expectation |
|---|---|
| App mode | Live / production Meta app (not only development testers) for customer-facing Page |
| Facebook Page | Owned/managed Page; permissions validated at connect |
| Instagram | Professional account + Page link; Standard vs Advanced Access documented for the chosen model |
| Auth model | Single documented path (Facebook Login **or** Instagram Login — not both mixed) |
| Callbacks | Exact production callback URLs registered |
| Secrets | Production-only; never logged; never returned to clients |

---

## 11. Exact staging SHA and release discipline

| Item | Value |
|---|---|
| Assessment baseline (staging tip at doc date) | `bf31401423b94e0d301800bb4be2a1613fa8ef85` |
| Includes | MKT-001F staging verification merge (PR #53) and prior MKT-001A–E/B.2 platform work |
| Production candidate | A **controlled release SHA** cut from staging after Facebook gate prep (and GBP flag hardening if needed) — not an automatic full-branch promote |
| Exact-SHA rule | Production deploy must match the approved candidate SHA |
| Evidence | Deployment inspector + `/api/health/environment` + operator smoke log |

Re-record the candidate SHA in this document (or a child release note) when the production GO decision is taken.

---

## 12. Rollback

| Layer | Action |
|---|---|
| Provider kill-switch | Set `MARKETING_PROVIDER_FACEBOOK=0` (immediate stop of new publishes / job execution) |
| Platform rollback | Redeploy previous production SHA |
| Queue | Disabled provider jobs dead-letter without Google/Meta retry storms |
| Data | Retain history/ledger; do not delete for rollback |
| GBP | Remains off; rollback must not re-enable GBP unless intentional |

Rollback readiness is a **platform gate** requirement before Facebook production GO.

---

## 13. Operator smoke (production)

### Shared

- Admin can open marketing hub and Connected Accounts.
- Disabled providers show as intentionally disabled / unavailable.
- No secrets in UI toasts or network responses.

### Facebook (required for Facebook GO)

- Connect production Page.
- Text post succeeds (controlled).
- Image post succeeds (controlled).
- Duplicate attempt blocked.
- Induced failure → retry/DLQ behaviour confirmed.
- History shows external post ID / permalink as designed.

### Instagram (required only for Instagram enablement)

- Professional account discovery and Page link.
- Single-image publish via container flow.
- Unsupported media rejected pre-queue.

### GBP

- Connect/publish unavailable while flag off.
- Status copy is pending/disabled — not treated as outage.
- No queue execution against Google.

---

## 14. Final decision per provider

| Provider | Decision | Gate status | Notes |
|---|---|---|---|
| Shared platform | **Ready to prepare** | OPEN — checklist on release SHA | Fail-closed controls **PASS** (§1c) |
| Facebook | **Pending controlled production gate** | OPEN — production smoke required | Explicit `MARKETING_PROVIDER_FACEBOOK=1` required |
| Instagram | **Pending MKT-001G** | NOT STARTED | Do not block Facebook |
| Google Business Profile | **Disabled; independent NO-GO** | OPEN (MKT-001A-PROD) | Fail-closed; unset or `=0` |
| LinkedIn | **Disabled** | N/A | Stub; flag off |
| Pinterest | **Disabled** | N/A | Stub; flag off |
| X | **Disabled** | N/A | Stub; flag off |
| **Full production authorization** | **Not yet granted** | — | Requires §1c sequence completion |

---

## 15. Next actions (authorized sequence)

1. Complete **MKT-001G — Meta Provider Readiness** (`feature/mkt-001g-meta-provider-readiness` from `staging`).
2. Run the Facebook controlled-post gate; record evidence.
3. Record approved providers and exact release SHA in `docs/releases/marketing-provider-release-manifest.md`.
4. Verify production environment flags before deployment (Facebook opt-in only after gate PASS; GBP off).
5. Release only the controlled SHA.
6. Enable only providers that individually passed their production gates.
7. Keep GBP and all deferred providers disabled until their gates close.

---

## 16. Why this change is safe

- **MKT-001C** introduced provider abstraction and registry-based availability (`requireEnabled`, feature flags).
- **Fail-closed defaults** ensure unset Production env cannot accidentally enable Facebook, GBP, or stubs.
- **MKT-001F** added registry-aware publishing controls and UX states that distinguish disabled from failed.
- **MKT-001B / B.2** durable queue already dead-letters disabled-provider jobs without retry loops.
- **Provider-release manifest** creates a permanent audit trail of SHA ↔ enabled providers per promote.
- GBP’s remaining blocker is **external Google API approval**, not a defect in the shared marketing platform.

Therefore GBP can remain **NO-GO** without blocking a Facebook-first (then Instagram) production path.

---

## Document control

| Field | Value |
|---|---|
| Status | **CONTROLS HARDENING PASS** (§1c) — full production authorization still **not granted** |
| Supersedes | Blanket “production NO-GO until MKT-001A-PROD” for the **entire** marketing platform |
| Does not close | MKT-001A-PROD (GBP); Facebook/Instagram production smoke; MKT-001G |
| Next | Authorized sequence in §1c / §15 |
| Owner path | Marketing platform engineering + operator smoke |
