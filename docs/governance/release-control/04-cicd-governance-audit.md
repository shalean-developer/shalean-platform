# 04 — CI/CD Governance Audit

| Field | Value |
|-------|-------|
| **Audit date** | 2026-07-14 |
| **Mutation** | None |

---

## 1. Active GitHub Actions

| Workflow | Trigger | Purpose | Gates production? |
|----------|---------|---------|-------------------|
| `web-test` | PR + push `main` (path-filtered) | Vitest, audit, typecheck, lint, live SEO | **No** (advisory unless required check) |
| `migration-governance` | PR + push `main` (migration paths) | Filename validation | **No** (advisory unless required check) |
| `sitemap-uptime` | Cron / manual | Prod sitemap probe | **No** (monitoring) |
| `gsc-quarterly-review` | Quarterly cron | GSC cannibalization | **No** |

### External / platform checks observed on commits

| Check | Role |
|-------|------|
| Vercel | Preview/build status |
| Vercel Preview Comments | UX for PRs |
| Supabase Preview | Branch preview; **unreliable / failed or skipped** on R1 path |
| GitGuardian | Secret scanning on PR |

---

## 2. Vercel builds

| Path | Behavior |
|------|----------|
| PR / feature | Preview build |
| `staging` | Preview build |
| `main` | **Production build + alias** (defect) |

There is no CI job that performs `vercel promote` under approval. Promotion is currently implicit.

---

## 3. Supabase validation in CI

| Present | Missing |
|---------|---------|
| Filename governance (`db:migrations:validate`) | Apply-to-staging job |
| Docs reference for migration workflow | Diff of pending remote versions |
| | Schema object smoke against staging |
| | Forbid merge when production promote would diverge from DB |

---

## 4. Missing gates (release-blocking)

| Gate | Status |
|------|--------|
| Required CI checks on `main` | Missing (GitHub) |
| Required human review | Missing |
| Staging migration success evidence | Process only |
| Staging HTTP/admin smoke evidence | Incomplete for R1 |
| Business Go / No-Go artifact | Missing |
| Migration Approval artifact | Missing (H02B template exists for DB program) |
| Deployment Approval artifact | Missing |
| Explicit promote step | Missing |
| Production smoke evidence | Missing |
| Release evidence pack (SHA, dpl IDs, migration versions) | Ad-hoc in audit docs |

---

## 5. Missing approvals

| Approval | Wired in automation? |
|----------|----------------------|
| Migration Approval | No |
| Deployment Approval | No |
| Go / No-Go | No |
| Emergency release exception | No formal path |

---

## 6. Missing quality checks

| Check | Notes |
|-------|-------|
| Schema ↔ app compatibility gate | Not automated |
| Production env parity check | Manual |
| Rollback drill / operator auth check | Failed during incident |
| Supabase Preview as required check | Not trustworthy enough yet |

---

## 7. Missing release evidence

Every production release should produce a durable record (ticket or `docs/releases/…` packet) with:

1. Change ID  
2. Git SHA  
3. RC deployment ID  
4. Staging deployment ID  
5. Migration versions applied (or N/A)  
6. Approver names + timestamps  
7. Go / No-Go result  
8. Promote timestamp + actor  
9. Production smoke results  
10. Rollback target deployment ID  

Today this exists only when audits are written after incidents.

---

## 8. Recommended CI/CD target (design)

```text
PR
  → required: vitest, migration-governance (+ expand checks carefully)
  → advisory: Vercel preview, GitGuardian
  → human review

Merge to main
  → builds RC only (after Vercel control)
  → does NOT move domains

Release workflow (manual / environment-protected)
  → attach Migration Approval evidence
  → attach Go packet
  → promote RC
  → post-promote smoke job or operator checklist
```

Do **not** auto-apply production migrations from CI without dual approval gates.

---

## 9. Conclusion

CI quality checks are useful but **orthogonal** to the incident root cause. The critical missing automation is:

1. Enforce checks/reviews before merge.  
2. Separate merge from domain move (Vercel).  
3. Require documented Migration + Deployment approvals before promote.

See [05-release-governance-standard.md](./05-release-governance-standard.md).
