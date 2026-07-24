# Git Branch Audit — Shalean Platform

**Repository:** `shalean-developer/shalean-platform`  
**Audit date:** 2026-07-24  
**Default branch:** `main` (protected)  
**Scope:** Read-only inventory. **No branches were deleted.**

**Method notes:**
- Remote refs after `git fetch --all --prune`
- “Merged into X” = branch tip is an ancestor of X **or** `ahead == 0`
- “Unique anywhere” = `git cherry` shows patches present on **neither** `main` nor `staging`
- PR state from GitHub (`gh pr list --state all`)

---

## 1. Branch inventory

### Local

| Branch | Notes |
|--------|-------|
| `main` | Only local branch in this workspace (tracks `origin/main`) |

### Remote (`origin`) — 18 branches

| Branch | Category | Tip | Last commit (UTC) | Last author | Age |
|--------|----------|-----|-------------------|-------------|-----|
| `main` | Long-lived / default | `4679441d` | 2026-07-24 08:48 | cursor[bot] | current |
| `staging` | Long-lived | `1dffc292` | 2026-07-23 18:09 | Cursor Agent | ~1d |
| `development` | Long-lived (ENV) | `9e9ee5d3` | 2026-07-15 01:23 | Farai Chitekedza | ~9d |
| `cursor/july-cleaner-earnings-reconcile-e29f` | Cursor / feature | `afc33315` | 2026-07-24 11:18 | Cursor Agent | current |
| `cursor/gsc-seo-fix-001-002-evidence-2c5d` | Cursor / docs | `1af767db` | 2026-07-22 16:18 | Cursor Agent | ~2d |
| `cursor/gsc-seo-fix-001-002-validation-2caf` | Cursor / docs | `10138962` | 2026-07-22 15:33 | Cursor Agent | ~2d |
| `cursor/pr98-staging-auth-verify-3f1b` | Cursor / docs | `9281d033` | 2026-07-23 18:09 | Cursor Agent | ~1d |
| `cursor/seo-fix-89-eo-preflight-42bc` | Cursor / docs | `32493e84` | 2026-07-22 14:39 | Cursor Agent | ~2d |
| `docs/seo-p1a-option-b-baseline` | Documentation | `2a3c62a0` | 2026-07-22 11:24 | Farai Chitekedza | ~2d |
| `docs/mkt-001h-staging-verification` | Documentation | `609b7526` | 2026-07-17 20:36 | Farai Chitekedza | ~6d |
| `docs/mkt-001g-staging-verification` | Documentation | `b8b50c5f` | 2026-07-17 18:13 | Farai Chitekedza | ~6d |
| `docs/mkt-001a-prod-release-gate` | Documentation | `32b9b753` | 2026-07-17 08:56 | Farai Chitekedza | ~7d |
| `chore/r1-2x-release-control-hardening` | Chore / docs | `b38db2e6` | 2026-07-14 19:45 | Farai Chitekedza | ~9d |
| `seo/fix-001-002-staging` | Feature (SEO) | `6780b1c7` | 2026-07-22 12:38 | Farai Chitekedza | ~2d |
| `fix/p2-r1-cash-sot-integrity` | Fix (merged) | `301a3713` | 2026-07-14 18:20 | Farai Chitekedza | ~9d |
| `fix/bk-001-confirm-cash-columns-before-payment` | Fix / WIP | `52dd9f95` | 2026-07-13 22:41 | Farai Chitekedza | ~10d |
| `beaulla/pr1-zoho-resend-staging-email-guard` | Beaulla | `210e6a49` | 2026-07-16 11:34 | Farai Chitekedza | ~8d |
| `codex-cleaner-audit` | Codex | `0aad6d27` | 2026-05-24 17:52 | Farai Chitekedza | ~60d |

### Category rollup

| Category | Count | Branches |
|----------|------:|----------|
| Long-lived | 3 | `main`, `staging`, `development` |
| Cursor-generated | 5 | `cursor/*` |
| Documentation | 4 | `docs/*` |
| Feature / SEO | 1 | `seo/fix-001-002-staging` |
| Fix | 2 | `fix/p2-r1-cash-sot-integrity`, `fix/bk-001-…` |
| Chore | 1 | `chore/r1-2x-release-control-hardening` |
| Beaulla | 1 | `beaulla/pr1-zoho-resend-staging-email-guard` |
| Codex | 1 | `codex-cleaner-audit` |

### Protection

| Branch | Protected |
|--------|-----------|
| `main` | **Yes** |
| `staging` | No |
| `development` | No |
| All others | No |

---

## 2. Merge status table

Legend: **Y** = tip ancestor / fully merged (ahead=0); **N** = not merged; **UA** = unique commits not content-equivalent on main **or** staging.

| Branch | → main | → staging | Ahead/Behind main | Ahead/Behind staging | Open PR | Closed/Merged PR | Last author | UA |
|--------|:------:|:---------:|-------------------|----------------------|---------|------------------|-------------|---:|
| `main` | — | N | 0 / 0 | 13 / 12 | — | — | cursor[bot] | — |
| `staging` | N | — | 12 / 13 | 0 / 0 | — | Merged #24, #71 → main (historical) | Cursor Agent | — |
| `development` | Y | Y | 0 / 215 | 0 / 214 | — | — | Farai Chitekedza | 0 |
| `cursor/july-cleaner-earnings-reconcile-e29f` | N | N | 1 / 0 | 14 / 12 | **#102** → staging | — | Cursor Agent | 1 |
| `cursor/gsc-seo-fix-001-002-evidence-2c5d` | N | N | 1 / 22 | 1 / 21 | **#92** → main | — | Cursor Agent | 1 |
| `cursor/gsc-seo-fix-001-002-validation-2caf` | N | N | 1 / 26 | 1 / 25 | **#90** → main | — | Cursor Agent | 1 |
| `cursor/pr98-staging-auth-verify-3f1b` | N* | N* | 1 / 11 | 6 / 15 | — | — | Cursor Agent | **0** |
| `cursor/seo-fix-89-eo-preflight-42bc` | N | N | 1 / 41 | 1 / 40 | — | — | Cursor Agent | 1 |
| `docs/seo-p1a-option-b-baseline` | N | **Y** | 2 / 41 | 0 / 38 | **#88** → main | — | Farai Chitekedza | 0† |
| `docs/mkt-001h-staging-verification` | N | N | 2 / 130 | 2 / 129 | **#58** → main | — | Farai Chitekedza | 2 |
| `docs/mkt-001g-staging-verification` | N | N | 1 / 132 | 1 / 131 | **#56** → main | — | Farai Chitekedza | 1 |
| `docs/mkt-001a-prod-release-gate` | N | N | 5 / 169 | 5 / 168 | **#40** → main | — | Farai Chitekedza | 5 |
| `chore/r1-2x-release-control-hardening` | N | N | 2 / 226 | 2 / 225 | **#4** → main | — | Farai Chitekedza | 2 |
| `seo/fix-001-002-staging` | N | **Y** | 4 / 41 | 0 / 36 | — | — | Farai Chitekedza | 0† |
| `fix/p2-r1-cash-sot-integrity` | Y | Y | 0 / 227 | 0 / 226 | — | **Merged #3** → main | Farai Chitekedza | 0 |
| `fix/bk-001-confirm-cash-columns-before-payment` | N | N | 2 / 239 | 2 / 238 | — | — | Farai Chitekedza | 1 |
| `beaulla/pr1-zoho-resend-staging-email-guard` | Y | Y | 0 / 184 | 0 / 183 | — | **Closed #22** (not merged; work landed via #23) | Farai Chitekedza | 0 |
| `codex-cleaner-audit` | Y | Y | 0 / 489 | 0 / 488 | — | — | Farai Chitekedza | 0 |

\* `cursor/pr98-staging-auth-verify-3f1b`: tip not an ancestor of main/staging, but every patch is already on main **and/or** staging (`git cherry` unique-anywhere = 0). Docs commit is content-equivalent on `staging`; SEO hotfix commits are on `main`.

† Content already on `staging`; open PR #88 still needed to land `docs/seo-p1a-…` on `main` (or via staging→main promotion).

### Open PRs (8)

| PR | Branch | Base | Title |
|----|--------|------|-------|
| [#102](https://github.com/shalean-developer/shalean-platform/pull/102) | `cursor/july-cleaner-earnings-reconcile-e29f` | staging | July cleaner earnings reconciliation |
| [#92](https://github.com/shalean-developer/shalean-platform/pull/92) | `cursor/gsc-seo-fix-001-002-evidence-2c5d` | main | GSC cron gate evidence |
| [#90](https://github.com/shalean-developer/shalean-platform/pull/90) | `cursor/gsc-seo-fix-001-002-validation-2caf` | main | GSC validation runner + monitoring plan |
| [#88](https://github.com/shalean-developer/shalean-platform/pull/88) | `docs/seo-p1a-option-b-baseline` | main | SEO-P1A Option B baseline |
| [#58](https://github.com/shalean-developer/shalean-platform/pull/58) | `docs/mkt-001h-staging-verification` | main | MKT-001H staging verification |
| [#56](https://github.com/shalean-developer/shalean-platform/pull/56) | `docs/mkt-001g-staging-verification` | main | MKT-001G staging verification |
| [#40](https://github.com/shalean-developer/shalean-platform/pull/40) | `docs/mkt-001a-prod-release-gate` | main | MKT-001A-PROD release gate |
| [#4](https://github.com/shalean-developer/shalean-platform/pull/4) | `chore/r1-2x-release-control-hardening` | main | R1.2X release-control hardening |

### `main` ↔ `staging` divergence (important)

At audit time the long-lived lines have **diverged**:

- **On `main`, not in `staging` (13 commits):** payout approval review-block (#101), payment-already-received to main (#96), SEO canonical hotfixes (#99/#100), related CI bumps.
- **On `staging`, not in `main` (12 commits):** PR #98 staging payment path + verify docs, SEO-FIX-001/002 staging merge (incl. P1A docs / P2 baselines), BILL-INV-002 staging merge, MKT-001M close-out docs.

Periodic promote/reconcile is recommended (see §5).

---

## 3. Disposition categories

### KEEP

| Branch | Reason |
|--------|--------|
| `main` | Default / production line; protected |
| `staging` | Long-lived UAT / Preview env line |
| `development` | Still part of ENV-03 model (Vercel Preview + git branch `development`, dedicated Supabase). Tip is fully contained in `main` but the **branch name** remains an active deploy target — do not delete without ENV redesign |
| `cursor/july-cleaner-earnings-reconcile-e29f` | Open PR #102; unique payout fix |
| `cursor/gsc-seo-fix-001-002-evidence-2c5d` | Open PR #92; unique docs |
| `cursor/gsc-seo-fix-001-002-validation-2caf` | Open PR #90; unique runner/docs |
| `docs/seo-p1a-option-b-baseline` | Open PR #88 (already on staging) |
| `docs/mkt-001h-staging-verification` | Open PR #58; unique docs |
| `docs/mkt-001g-staging-verification` | Open PR #56; unique docs |
| `docs/mkt-001a-prod-release-gate` | Open PR #40; unique docs (5 commits) |
| `chore/r1-2x-release-control-hardening` | Open PR #4; unique governance docs |

### SAFE TO DELETE

Fully merged and/or no unique commits remaining anywhere. **Not deleted in this audit.**

| Branch | Why safe |
|--------|----------|
| `beaulla/pr1-zoho-resend-staging-email-guard` | Fully merged into main + staging; closed PR #22 |
| `codex-cleaner-audit` | Fully merged; ~60d stale; no PR; no unique commits |
| `fix/p2-r1-cash-sot-integrity` | Merged PR #3; tip fully in main + staging |
| `seo/fix-001-002-staging` | Tip fully in `staging`; unique-anywhere = 0; no open PR |
| `cursor/pr98-staging-auth-verify-3f1b` | Unique-anywhere = 0 (docs ≡ staging; hotfixes ≡ main); no open PR |

### REQUIRES REVIEW

| Branch | Issue | Suggested action |
|--------|-------|------------------|
| `cursor/seo-fix-89-eo-preflight-42bc` | 1 unique docs/evidence commit for PR #89 EO preflight; **no open PR**; may be abandoned after #89 merged | Confirm whether EO package should land on `main` as a docs PR, or discard |
| `fix/bk-001-confirm-cash-columns-before-payment` | Tip has unique WIP commit (`52dd9f95`, ~37 files / +2.8k lines) on top of a cash fix that is already content-merged; **no PR**; likely superseded by later BK / cash SOT work but WIP is not identical | Diff against current `main` cash/settlement paths; recover anything still useful or discard |

### Duplicate / abandoned signals

| Signal | Detail |
|--------|--------|
| Abandoned Cursor | `cursor/seo-fix-89-eo-preflight-42bc` — unique content, no PR |
| Abandoned WIP | `fix/bk-001-…` — explicit `wip:` tip, no PR, 10d old |
| Superseded / absorbed | `seo/fix-001-002-staging` absorbed into `staging`; `docs/seo-p1a-…` is ancestor of that staging tip |
| Content-duplicate Cursor | `cursor/pr98-staging-auth-verify-3f1b` duplicates staging verify docs (patch-equivalent) |
| Stale merged leftovers | `codex-cleaner-audit`, `fix/p2-r1-…`, `beaulla/pr1-…` |
| Already-deleted heads | Many merged Cursor branches (e.g. after #101, #100, #99, #96, #95, #93, #91) are **already gone** from remote — good hygiene for those |

---

## 4. Commands that would delete SAFE TO DELETE branches

**Do not run unless explicitly authorized.** Remote-only deletes (no local clones of these branches in this workspace):

```bash
# SAFE TO DELETE — remote branches only
git push origin --delete beaulla/pr1-zoho-resend-staging-email-guard
git push origin --delete codex-cleaner-audit
git push origin --delete fix/p2-r1-cash-sot-integrity
git push origin --delete seo/fix-001-002-staging
git push origin --delete cursor/pr98-staging-auth-verify-3f1b
```

Batched form:

```bash
git push origin --delete \
  beaulla/pr1-zoho-resend-staging-email-guard \
  codex-cleaner-audit \
  fix/p2-r1-cash-sot-integrity \
  seo/fix-001-002-staging \
  cursor/pr98-staging-auth-verify-3f1b
```

After reviewing REQUIRES REVIEW (only if decided discard):

```bash
# ONLY after human confirmation that content is not needed
# git push origin --delete cursor/seo-fix-89-eo-preflight-42bc
# git push origin --delete fix/bk-001-confirm-cash-columns-before-payment
```

---

## 5. Repository cleanup recommendations

1. **Authorize a first delete pass** for the five SAFE TO DELETE remotes above (no open PRs, no unique commits).
2. **Protect `staging`** (and optionally `development`) the same way as `main` — require PR reviews / block force-push — so UAT cannot be rewritten accidentally. Today only `main` is protected.
3. **Reconcile `main` ↔ `staging` divergence** (13 behind / 12 ahead). Prefer an explicit promote PR (`staging` → `main` and/or cherry-pick missing main hotfixes onto staging) so Preview and Production do not drift.
4. **Close or merge the four stale-ish open docs/chore PRs** (#4, #40, #56, #58) or mark them blocked with owners — they are 6–9 days behind and accumulate merge conflict risk.
5. **Keep `development`** until ENV-03 Vercel/Supabase mapping is redesigned; deleting the git branch would break Preview env scoping documented under `docs/audits/environments/`.
6. **Enable auto-delete of head branches** on merge (GitHub setting) if not already on — most recent Cursor merges already cleaned up, but leftovers like `fix/p2-r1-…` show gaps.
7. **Triage REQUIRES REVIEW within one cleanup pass:** decide land-vs-discard for EO preflight evidence and the BK-001 WIP tip.
8. **Naming hygiene:** prefer `cursor/…`, `fix/…`, `docs/…` prefixes; retire flat names like `codex-cleaner-audit` when deleting.

---

## Appendix A — Quick counts

| Metric | Count |
|--------|------:|
| Remote branches | 18 |
| Local branches (this workspace) | 1 (`main`) |
| Open PR head branches | 8 |
| SAFE TO DELETE | 5 |
| REQUIRES REVIEW | 2 |
| KEEP (long-lived + open PR) | 11 |

## Appendix B — Audit commands used

```bash
git fetch --all --prune
git branch -a
git rev-list --left-right --count origin/main...origin/<branch>
git rev-list --left-right --count origin/staging...origin/<branch>
git merge-base --is-ancestor origin/<branch> origin/main
git cherry -v origin/main origin/<branch>
git cherry -v origin/staging origin/<branch>
gh pr list --state all --limit 300
gh api repos/shalean-developer/shalean-platform/branches --paginate
```
