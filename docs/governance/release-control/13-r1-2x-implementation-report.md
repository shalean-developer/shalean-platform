# 13 — R1.2X Implementation Report

| Field | Value |
|-------|-------|
| **Package** | R1.2X — Release-Control Hardening Implementation |
| **Date** | 2026-07-14 |
| **Authorization** | R1.2X Implementation (this phase) |
| **Predecessor** | R1.2 design READY (`docs/governance/release-control/`) |
| **Git branch** | `chore/r1-2x-release-control-hardening` |
| **R1 app SHA on main** | `6201e0d27c1d20d7562fb99b44907062f35efc0c` (not customer-visible) |
| **Production traffic (verified)** | `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` @ `45ccd98f` |
| **Production DB** | Pre-R1 (unchanged this phase) |
| **Final decision** | See §8 |

---

## 1. Objective

Permanently prevent production deployments from bypassing the Shalean release process, without releasing R1, migrating production, or changing application business logic.

---

## 2. Implemented controls

### Part A — GitHub

| Control | Status | Evidence |
|---------|--------|----------|
| Repository ruleset `main-release-control` on `main` | **Active** | Ruleset ID `18942926` |
| Require pull request before merge | **Active** | Ruleset `pull_request` rule |
| Required status checks | **Active** | `vitest`, `validate-migration-filenames` (strict) |
| Prevent force pushes | **Active** | `non_fast_forward` + branch protection `allow_force_pushes: false` |
| Prevent branch deletion | **Active** | `deletion` rule + `allow_deletions: false` |
| Restrict direct pushes to `main` | **Active** | PR-required ruleset; admins enforced |
| Legacy branch protection (defense in depth) | **Active** | `PUT …/branches/main/protection`, `enforce_admins: true` |
| Conversation resolution required | **Active** | Ruleset + protection |
| Dismiss stale reviews | **Active** | Yes |
| Merge strategy | **Applied** | Squash + merge allowed; **rebase disabled** at repo + ruleset |
| Delete head branch on merge | **Enabled** | Repo setting |
| CODEOWNERS | **Added** | `.github/CODEOWNERS` |
| Required approving reviews ≥1 | **Not enforced** | See limitations (sole collaborator) |
| Required code-owner reviews | **Off** | Same — would brick merges with one human |

### Part B — Vercel

| Control | Status | Evidence |
|---------|--------|----------|
| Option B — `github.autoAlias: false` in `apps/web/vercel.json` | **Implemented in repo** | Takes effect on subsequent Git deployments reading project config |
| Option A — `autoAssignCustomDomains: false` (Dashboard / PATCH) | **Not applied via API** | Local CLI authenticated to wrong team; browser session not logged into `shalean-cleaning-services` |
| Preview / staging branch behavior | **Preserved** | No change to preview paths |
| Instant Rollback capability | **Unchanged / available** | Known-good `dpl_ErXv83…` retained |
| Explicit promote procedure | **Documented** | `06-production-deployment-standard.md` + templates |

**Closest supported alternative until Option A is toggled by a team admin:** Option B (`autoAlias: false`) plus operational freeze and Go packets. Team admin should still disable **Auto-assign Custom Production Domains** under Project → Settings → Environments → Production (Option A) at first opportunity.

### Part C — Supabase

| Control | Status |
|---------|--------|
| Schema changes | **None** |
| Migration execution | **None** |
| Operational checklists | **Added** — [14-supabase-operational-checklists.md](./14-supabase-operational-checklists.md) |
| PITR / ownership / approval process | **Documented** (PITR remains disabled — re-verify at T-0) |

### Part D — Repository governance assets

| Asset | Path |
|-------|------|
| CODEOWNERS | `.github/CODEOWNERS` |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md` |
| Go / No-Go template | `templates/go-no-go-packet.md` |
| Migration Approval template | `templates/migration-approval.md` |
| Deployment Approval template | `templates/deployment-approval.md` |
| Production readiness template | `templates/production-readiness-checklist.md` |
| Release evidence pack | `templates/release-evidence-pack.md` |
| Incident / rollback template | `templates/incident-rollback.md` |
| Production release checklist (updated) | [15-production-release-checklist.md](./15-production-release-checklist.md) |

### Part E — CI/CD

| Control | Status |
|---------|--------|
| Always-run `web-test` on PRs | **Implemented** (required check always reportable) |
| Always-run `migration-governance` on PRs | **Implemented** |
| Required checks wired in ruleset/protection | **Yes** |
| Auto production promote from CI | **Not added** (forbidden) |
| Release evidence workflow | **Manual / template-based** (no auto-promote job) |

---

## 3. Controls not implemented / platform limitations

| Item | Limitation | Compensating control |
|------|------------|----------------------|
| Required PR approvals ≥1 | Personal repo; sole collaborator `shalean-developer` | PR required + conversation resolution + dual-approve Go packets for production promote |
| CODEOWNERS required reviews | Same sole-owner constraint | CODEOWNERS present as ownership map; reviews not required yet |
| GitHub org teams | Owner type = User (not Org) | Use `@shalean-developer` in CODEOWNERS until org/teams exist |
| Vercel Option A API toggle | CLI token scoped to personal team `farais-projects-…`, not `shalean-cleaning-services` | Repo Option B + manual Dashboard step for team admin + interim merge freeze for produce-impacting work until Option A confirmed |
| Named role humans (RM/DB/Eng/Ops) | Still TBD in approval matrix | Assign before R1.3 |
| GitHub Environment protection reviewers | Same sole-owner; Environments not used for Vercel promote | Document Environments as future wire-up |

---

## 4. Verification evidence

### GitHub (executed 2026-07-14)

```text
Ruleset: main-release-control (id 18942926) enforcement=active
Rules: deletion, non_fast_forward, pull_request, required_status_checks
Required checks: vitest, validate-migration-filenames (strict)
Branch protection: enforce_admins=true, allow_force_pushes=false, allow_deletions=false
Repo: allow_rebase_merge=false, allow_squash_merge=true, delete_branch_on_merge=true
```

### Vercel traffic (must remain pre-R1)

| Item | Expected | Verified |
|------|----------|----------|
| Customer deploy | `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` | Re-check at close of phase |
| Customer SHA | `45ccd98f…` | Re-check |
| No production migrate | Pre-R1 history | No SQL mutate this phase |

### Supabase

- No `apply_migration`, no schema SQL, no repair executed in R1.2X.

### Application

- No business-logic source changes; only `apps/web/vercel.json` governance flag + workflows/docs/templates.

---

## 5. Remaining risks

1. **Option A not yet confirmed in Dashboard** — until a `shalean-cleaning-services` admin disables auto-assign custom production domains, residual risk depends on Option B taking effect on next Git deploy and on merge discipline.
2. **Sole-owner merge path** — PRs can still be merged without a second human reviewer; production safety relies on Deployment/Migration Approvals not being skipped.
3. **Wrong Vercel team CLI scope** — operators must authenticate to `shalean-cleaning-services` before promote/rollback (R1 lesson).
4. **Named role holders unset** — R1.3 blocked until humans assigned.
5. **autoAlias Option B** — Vercel docs prefer staged production (Option A); Option B may change merge deploys to preview-class behavior — validate on first post-merge deploy **without** promoting domains.

---

## 6. Updated production release checklist

See [15-production-release-checklist.md](./15-production-release-checklist.md).

---

## 7. Stop conditions honored

| Condition | Honored? |
|-----------|----------|
| No R1 production release | Yes |
| No production migration | Yes |
| No intentional production promote | Yes |
| No app business-logic change | Yes |
| Governance commit separate from R1 feature work | Yes (this package) |

---

## 8. Final decision

### CONDITIONAL PASS

Release-control hardening is implemented with documented platform limitations (Vercel Option A pending team-admin Dashboard toggle; required human approvals not enforceable with sole collaborator).

**R1 may proceed to the production release gate (R1.3) only with these compensating controls:**

1. Team admin enables Option A (`Auto-assign Custom Production Domains` = Off) and records proof before R1 promote.
2. First merge after Option B lands: confirm customer domains did **not** move; treat unexpected domain move as SEV-1 Instant Rollback.
3. Assign named Release Manager, Database Owner, Engineering Owner, Operations Owner before R1.3.
4. Dual Migration Approval + Deployment Approval + Go packet mandatory for R1.
5. Keep Instant Rollback target `dpl_ErXv83…` until intentionally superseded.

Do **not** execute R1 production release in this phase.
