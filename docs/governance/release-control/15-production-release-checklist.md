# 15 — Production release checklist (post R1.2X)

Canonical checklist for any production release after release-control hardening.  
Feature packs (e.g. R1) must also satisfy their specific readiness list.

---

## A. Platform controls (once per environment; re-verify at T-0)

- [ ] GitHub ruleset `main-release-control` active on `main`
- [ ] Required checks `vitest` + `validate-migration-filenames` enforced
- [ ] Force-push / branch deletion blocked
- [ ] Direct pushes to `main` blocked (PR required)
- [ ] Vercel **Auto-assign Custom Production Domains** = Off (Option A) — **record screenshot/API proof**
- [ ] Confirm `apps/web/vercel.json` retains `github.autoAlias: false` (Option B belt)
- [ ] Instant Rollback known-good ID recorded
- [ ] Operator authenticated to Vercel team `shalean-cleaning-services`

## B. People

- [ ] Release Manager named (+ backup)
- [ ] Database Owner named (+ backup)
- [ ] Engineering Owner named
- [ ] Operations Owner named (smoke + 24h watch)
- [ ] Business Owner consulted if high impact

## C. Candidate

- [ ] Change ID
- [ ] Approved Git SHA
- [ ] RC deployment ID READY
- [ ] Scope / exclusions written
- [ ] Migrations listed or N/A

## D. Staging

- [ ] Staging schema + `schema_migrations` Git-aligned
- [ ] Staging app bound to staging Supabase (`gfvdic…`)
- [ ] Staging smoke always-matrix PASS
- [ ] Feature smoke PASS

## E. Production database (if schema required)

- [ ] Migration Approval dual-signed
- [ ] Identity proof `tchaye…`
- [ ] Dry-run == approval
- [ ] Migrate exact versions via CLI
- [ ] Verification SQL PASS
- [ ] Evidence filed

## F. Go / promote

- [ ] Go / No-Go = GO (or constraints written)
- [ ] Deployment Approval signed
- [ ] Promote via Dashboard or `vercel promote … -S shalean-cleaning-services`
- [ ] Hostname → expected `dpl_…` + SHA
- [ ] Production smoke PASS
- [ ] Release evidence pack filed
- [ ] 24h watch owner named

## G. Abort / rollback

- [ ] Rollback Decision owner known
- [ ] Target `dpl_…` pre-staged
- [ ] Hostname verification mandatory before “success”

---

### Current traffic baseline (do not change without GO)

| Item | Value |
|------|-------|
| Deployment | `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` |
| SHA | `45ccd98f28c892d4598a253e1386f7dfec84f1e5` |
| Production DB | Pre-R1 |

### Templates

- [go-no-go-packet.md](./templates/go-no-go-packet.md)
- [migration-approval.md](./templates/migration-approval.md)
- [deployment-approval.md](./templates/deployment-approval.md)
- [production-readiness-checklist.md](./templates/production-readiness-checklist.md)
- [release-evidence-pack.md](./templates/release-evidence-pack.md)
- [incident-rollback.md](./templates/incident-rollback.md)
