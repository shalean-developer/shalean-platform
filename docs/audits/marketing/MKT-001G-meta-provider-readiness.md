# MKT-001G — Meta Provider Production Readiness

**Project:** Shalean Cleaning Services  
**Phase:** MKT-001G — Instagram / Meta Provider Readiness  
**Date:** 2026-07-17  
**Branch:** `feature/mkt-001g-meta-provider-readiness`  
**Base:** `staging` @ `1472c547` (includes fail-closed provider flags + release manifest)  
**Type:** Engineering implementation (staging-first; production unauthorized)

---

## Governance

| Constraint | Status |
|---|---|
| Fail-closed provider defaults | Required — inherited from staging tip |
| GBP / MKT-001A-PROD | Independent NO-GO — not closed by this phase |
| Full production authorization | **Not granted** until staging PASS + Facebook controlled-post gate + manifest + exact SHA + env flags + rollback evidence |
| Deferred Instagram features | Carousels, Reels, Stories, video, product tagging, collabs |

**Auth model (documented):** **Facebook Login** only — Page-linked Instagram Professional account. Do not mix with Instagram Login.

---

## Scope delivered (implementation)

| Item | Status |
|---|---|
| Instagram professional-account discovery | Implemented |
| Facebook Page linkage validation | Implemented |
| Meta permission error surfacing | Implemented |
| Instagram provider adapter | Replaces stub in registry |
| Single-image feed publishing | Container → status → publish |
| Idempotency / durable jobs | `instagram` added to ledger + jobs constraints |
| Retry classification | Provider-specific guidance |
| Encrypted token/account persistence | `social_accounts` upsert (`v2:` envelope) |
| Connection-health monitoring | validateConnection + Connected Accounts card |
| Disabled-by-default production flag | `MARKETING_PROVIDER_INSTAGRAM` default off |
| Admin publish + connect routes | `/api/admin/promotions/publish-instagram` |
| Social Posts / Connected Accounts UX | Wire-up for connect + publish |
| Unit / contract tests | `mkt001gInstagram.test.ts` |

---

## Staging enablement

```text
MARKETING_PROVIDER_FACEBOOK=1
MARKETING_PROVIDER_INSTAGRAM=1   # only for deliberate IG testing
MARKETING_PROVIDER_GOOGLE_BUSINESS=0
```

Apply migration `20260717180000_mkt_001g_instagram_ledger_provider.sql` on staging before publish smoke.

---

## Release gates (not yet PASS)

### Facebook controlled-post gate

Still required before any Meta-first production promote (independent of Instagram).

### Instagram gate

- Professional account discovered
- Page linkage verified
- Permissions approved
- Image container created
- Publish succeeds
- Media ID reconciled
- Unsupported media rejected before queueing
- Retry does not create duplicate media
- Token expiry / reconnect tested

### Production

Record approved providers + exact SHA in `docs/releases/marketing-provider-release-manifest.md` before promote. Keep GBP and deferred providers disabled.
