# 02 — Vercel Governance Audit

| Field | Value |
|-------|-------|
| **Project** | `shalean-platform` (`prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc`) |
| **Team** | `shalean-cleaning-services` (`team_gSaraaY4wPNKtO0Pfx5MY42D`) |
| **Framework** | Next.js |
| **Audit date** | 2026-07-14 |
| **Mutation** | None |

---

## 1. Why production auto-deployed

### Causal chain (PR #3)

1. PR #3 merged into `main` at `2026-07-14T16:25:44Z`.
2. Merge SHA: `6201e0d27c1d20d7562fb99b44907062f35efc0c`.
3. Vercel Git integration created `dpl_6TkwPn5Vkiwx9AnazJHXTnthvynu` with:
   - `githubCommitRef: main`
   - `target: production`
   - Customer aliases assigned (`shalean.co.za`, `www.shalean.co.za`, …)
4. The same SHA on Git branch `staging` produced `dpl_4vNjXoRh…` with `target: null` (preview only) — correct non-production path.

### Root settings (behavioral proof)

| Setting / behavior | Current effect |
|--------------------|----------------|
| Production Git branch | **`main`** (all production-targeted deploys show `githubCommitRef: main`) |
| Automatic production deployment | **Enabled** (merge/push → `target: production`) |
| Automatic alias assignment | **Enabled** (domains moved with production deploy) |
| Repo `apps/web/vercel.json` | Install + crons only — **no** promote / autoAlias brake |
| Local CLI team scope | Often **missing** (`scope does not exist`) — operators must use team-authenticated session |

MCP `get_project` confirms project identity, domains, and latest deployment, but does not expose every dashboard toggle. Production-branch behavior is proven by deployment metadata, not by Dashboard screenshots in this phase.

---

## 2. Current deployment model

```text
Feature / PR branch push  → Preview (target null) + branch alias
Push/merge to main        → Production (target production) + customer domains
Push to staging           → Preview (target null) + staging branch alias
```

### Domains on project

- `shalean.co.za`
- `www.shalean.co.za`
- `shalean-platform-six.vercel.app`
- `shalean-platform-shalean-cleaning-services.vercel.app`
- `shalean-platform-git-main-shalean-cleaning-services.vercel.app`

### Current traffic (post-rollback)

| Item | Value |
|------|-------|
| Active domain deployment | `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` |
| SHA | `45ccd98f28c892d4598a253e1386f7dfec84f1e5` |
| Aliases include | `shalean.co.za`, `www.shalean.co.za` |
| Git `main` tip | Still `6201e0d2` — **main ≠ customer traffic** |

**Critical residual risk:** any new push to `main` can auto-promote again until controls change.

---

## 3. Capacities that exist today

| Capability | Status | Notes |
|------------|--------|-------|
| Preview deployments | Working | Feature branches + `staging` |
| Production deployments | Working (too automatic) | Every `main` push |
| Instant Rollback / promote prior | Proven in emergency | Restored `dpl_ErXv83…` |
| Rollback candidates | Listed by platform | `dpl_ErXv83…`, `dpl_6TkwPn5…` marked candidates |
| Manual promotion | Supported by Vercel product | **Not required** by current process |
| Deployment protection (password/SSO/Vercel Auth) | Not part of this release incident | Separate hardening track |
| Audit trail | Deployment list + Git meta + creator | Sufficient for post-incident forensics |
| Team permissions | Team-scoped operations required | Personal CLI scope blocked rollback during incident |

---

## 4. What enabled the incident

| Factor | Role |
|--------|------|
| Production Branch = `main` | Primary trigger |
| Auto production deploy on Git push | Primary trigger |
| Auto assignment of production aliases | Made it customer-visible |
| No staged / promote-only gate | Missing brake |
| No required Release Manager promote | Process gap |
| GitHub unprotected `main` | Allowed merge without gates |

---

## 5. Settings that should change (design)

Choose **one** primary control (recommended order):

### Option A — Recommended: staged / promote-only production

| Intent | Effect |
|--------|--------|
| Builds from `main` create a production **candidate** | Artifact exists |
| Customer domains unchanged until **Promote** | Merge ≠ release |
| Release Manager runs Promote after Go / migrations | Explicit approval |

Implementation note (execution phase): apply via Vercel project settings (Staged Production / require explicit promote / equivalent team setting). Confirm exact Dashboard/API field names during implementation; do not assume from this audit alone.

### Option B — Disable automatic custom-domain aliasing

| Intent | Effect |
|--------|--------|
| Keep production branch `main` but disable auto alias | Domains do not move on merge |
| Operator assigns aliases / promote later | Explicit domain move |

Use if Option A is unavailable on the current plan; verify equivalent toggles such as project Git “auto-assign custom production domains” / legacy `github.autoAlias` behaviors carefully.

### Option C — Dedicated production branch or tag channel

| Intent | Effect |
|--------|--------|
| Production Branch = `production` or release tag pipeline | Only intentional release commits promote |
| `main` becomes integration only | Safer developer velocity |

Requires disciplined release branch discipline and still needs alias control.

### Must remain enabled

| Keep | Reason |
|------|--------|
| Preview deployments for PR branches | Review & QA |
| Staging branch preview alias | Staging smoke without customer domains |
| Instant Rollback | MTTR |
| GitHub integration (with promote gate) | Traceability |
| Production regions / Next.js framework settings | Continuity |

---

## 6. Release Candidate (RC) support

**Yes — supported** if Option A/B/C is applied:

| RC artifact fields | Required |
|--------------------|----------|
| Git SHA | Yes |
| Vercel deployment ID | Yes |
| `target` after control | production candidate **or** preview-with-promote path |
| Customer domains on RC | **Must be false** until promote |
| Linked migration plan | Yes / N/A |

Until A–C is live, every merge to `main` is an RC **and** a production release simultaneously — that is the defect.

---

## 7. Recommended steady-state flow

```text
Merge to main
  → Build RC (no customer domain move)
  → Staging bind / smoke
  → Migration Approval → production migrate (if needed)
  → Deployment Approval + Go
  → vercel promote <rc>  (team-scoped)
  → Domain verification + smoke
```

Example promote (execute only after GO; team-scoped):

```bash
vercel promote <rc-deployment-id-or-url> -S shalean-cleaning-services --yes
```

---

## 8. Audit conclusion

| Finding | Severity |
|---------|----------|
| Merge to `main` auto-ships customer domains | **Critical** |
| Rollback works when team-authenticated human acts | Residual medium (access ownership) |
| Preview / staging paths are sound | Strength |
| Promote-capable product features exist but unused | Process debt |

**Design decision:** Adopt **Option A** as the default Vercel control for Shalean production; fall back to B or C only if A cannot be enabled.

See [06-production-deployment-standard.md](./06-production-deployment-standard.md).
