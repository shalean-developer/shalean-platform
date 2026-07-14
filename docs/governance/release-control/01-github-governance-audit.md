# 01 — GitHub Governance Audit

| Field | Value |
|-------|-------|
| **Repository** | `shalean-developer/shalean-platform` |
| **Audit date** | 2026-07-14 |
| **Default branch** | `main` |
| **Visibility** | `public` |
| **Mutation** | None (read-only API) |

---

## 1. Current configuration (verified)

| Control | Observed state | Evidence |
|---------|----------------|----------|
| Default branch | `main` | `gh api repos/…` |
| Branch protection on `main` | **Missing** | HTTP 404 “Branch not protected” |
| Repository rulesets | **None** | `GET …/rulesets` → `[]` |
| Active branch rules on `main` | **None** | `GET …/rules/branches/main` → `[]` |
| CODEOWNERS | **Absent** | No root or `.github/CODEOWNERS` |
| Required reviewers | **Not enforced** | No protection / empty PR #3 reviews |
| Required status checks | **Not enforced** | Protection absent |
| Required conversation resolution | **Not enforced** | Protection absent |
| Merge methods | Merge commit, squash, rebase **all allowed** | Repo settings |
| Auto-merge | Disabled | `allow_auto_merge: false` |
| Delete branch on merge | Disabled | `delete_branch_on_merge: false` |
| Tags / releases | **No tags** | `GET …/tags` → `[]` |
| Release branches | Informal only (`staging`, `development`, feature branches) | Branch list |
| Admin bypass of branch protection | N/A (no protection to bypass) | — |
| Force-push / delete protections | **Not enforced via rules** | Unprotected `main` |
| Secret scanning | Enabled | Repo security settings |
| Secret scanning push protection | Enabled | Repo security settings |
| Dependabot security updates | Disabled | Repo security settings |
| GitHub Actions | Enabled; `allowed_actions: all` | Actions permissions |
| Collaborators (API-visible) | `shalean-developer` (admin) | Collaborators API |

### GitHub Environments (present but ungated)

| Environment | Protection rules | Admin bypass |
|-------------|------------------|--------------|
| Preview | **None** | Allowed |
| Production | **None** | Allowed |
| Production – shalean-platform | **None** | Allowed |
| Production – shalean-platform-nll2 | **None** | Allowed |
| Production – shalean-platform-web | **None** | Allowed |

These environments do **not** gate Vercel Git production aliasing today. They are inert for release control until wired to required reviewers / wait timers and used by a release workflow.

### PR #3 evidence (incident merge)

| Item | Value |
|------|-------|
| Merged | `2026-07-14T16:25:44Z` |
| Reviews | **None** |
| reviewDecision | Empty |
| Checks at merge time | vitest ✅, migration-governance ✅, Vercel ✅, GitGuardian ✅; Supabase Preview skipped/failed across events |

**Conclusion:** An unprotected `main` allowed merge without required review or enforceable green-check policy.

---

## 2. Strengths

1. Secret scanning + push protection are on.
2. Useful CI exists (`web-test`, `migration-governance`) and often runs on PRs.
3. Auto-merge is off (reduces accidental bulk merges).
4. Staging Git branch exists as a non-customer path for preview deploys.
5. Prior R1 recovery / H02B governance docs establish process language to harden against.

---

## 3. Weaknesses

| Weakness | Severity |
|----------|----------|
| No branch protection / rulesets on `main` | **Critical** |
| No required PR reviews | **Critical** |
| No required status checks | **High** |
| No CODEOWNERS for sensitive paths (`supabase/migrations`, payments, auth) | **High** |
| No release tags / immutable release markers | **Medium** |
| GitHub Environments exist without protection rules | **Medium** |
| Admin can push/merge freely; no break-glass policy | **High** |
| Failed/skipped Supabase Preview did not block merge | **Medium** |

---

## 4. Risks

1. Anyone with write/admin can push or merge to `main` and (via Vercel) ship customer traffic immediately.
2. Hotfixes and docs merges share the same blast radius as schema-dependent feature releases.
3. No durable audit of “who approved production” on the GitHub side — only Vercel deployment history.
4. Environments named “Production” create false confidence that GitHub is gating production.

---

## 5. Recommended production policy (design — do not apply here)

### 5.1 Branch ruleset on `main` (preferred over legacy branch protection)

| Rule | Required value |
|------|----------------|
| Require pull request before merge | Yes |
| Required approvals | ≥ 1 (prefer 2 for schema / payments / auth) |
| Dismiss stale approvals | Yes |
| Require conversation resolution | Yes |
| Require status checks to pass | Yes |
| Required checks (minimum) | `vitest`, `validate-migration-filenames` |
| Block force pushes | Yes |
| Block deletions | Yes |
| Restrict who can push | Maintainers / designated release roles only |
| Allow admin bypass | **No** for routine work; break-glass documented separately |

### 5.2 CODEOWNERS (recommended paths)

```text
/supabase/migrations/          @DatabaseOwnerTeam
/apps/web/app/api/             @EngineeringOwnerTeam
/.github/workflows/            @EngineeringOwnerTeam
/docs/governance/              @ReleaseManagerTeam
```

Exact GitHub teams/users to be assigned in the implementation phase.

### 5.3 Merge strategy

| Policy | Recommendation |
|--------|----------------|
| Preferred | Squash merge for feature PRs (clean main history) |
| Allowed for release integration | Merge commit when explicitly needed |
| Rebase merge | Disable or restrict |

### 5.4 Tags & release branches

| Artifact | Policy |
|----------|--------|
| Production release tag | `prod-YYYYMMDD-HHMM` or `rN.M` created **after** Go + promote |
| Tag creation | Release Manager only |
| Long-lived `release/*` | Optional; not required if Vercel promote-gate is Option A |

### 5.5 Environments

Reuse GitHub Environment `Production` for any future workflow that deploys/promotes:

- Required reviewers ≥ 1 Release Manager
- Wait timer optional (e.g. 5–15 minutes) for non-emergency
- Deployment branches limited to `main` (or approved release tags)

---

## 6. What GitHub cannot fix alone

Even perfect branch protection **cannot** prevent customer domain movement if Vercel still treats `main` as an auto-promoting production branch. GitHub and Vercel controls are **both** mandatory.

See [02-vercel-governance-audit.md](./02-vercel-governance-audit.md).
