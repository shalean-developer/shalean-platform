# H02B Linked Environment Identity Investigation

**Date:** 2026-07-14  
**Audit type:** Read-only identity and repository-safety investigation  
**Approved commit:** `99526d72fca841fdc189eaf33720655a564675b0`  
**Investigation scope:** H02B Go/No-Go identity and repository gate review only  
**Production mutation:** None

---

## Executive Summary

| Field | Conclusion |
|-------|------------|
| Investigation status | **COMPLETE** (evidence documented; remediations not executed) |
| Linked identity conclusion | **`--linked` targets non-production** — Supabase preview branch `development` (`hborcp****jnfei`), child of production `tchaye****xlvfu`, created with `with_data=false` |
| Repository branch conclusion | On `staging` at approved SHA; `staging`/`main`/`origin/staging`/`origin/main` are **identical SHA**; branch **name** gate still FAIL |
| `.env.example` conclusion | Unexpected wholesale rewrite — **unrelated to H02**; placeholders only; **no real secrets**; must be excluded from H02 remediation commits unless separately approved |
| Relinking required? | **YES** — before any further `--linked` history/data gates can be trusted |
| H02B status | **REMAINS BLOCKED** (`NO-GO`) |

```text
LINKED TARGET CONFIRMED AS NON-PRODUCTION
WRONG TARGET CONFIRMED — H02B BLOCKED
```

---

## Trusted Production Identity

| Attribute | Value (masked) |
|-----------|----------------|
| Name | `shalean-platform` |
| Ref | `tchaye****xlvfu` |
| Region | `eu-west-3` |
| Postgres engine (projects API) | `17.6.1.105` |
| Status | `ACTIVE_HEALTHY` |
| Org | `cfzsf****` (same org as siblings) |
| Live data shape (this investigation, SELECT-only MCP) | `auth.users=167`, `bookings=432`; objects `bookings`, `monthly_invoices`, `cleaner_payouts` present |

**Rejected sibling (must never be used):** `shalean project` / `qpqn****ejrb` / `eu-west-1`.

---

## Identity Sources

| Source | Observed Project Prefix | Environment Label | Tracked/Ignored | Trusted? | Notes |
| ------ | ----------------------- | ----------------- | --------------- | -------- | ----- |
| `supabase/config.toml` | _(none)_ | local CLI config | tracked | N/A | No `project_id`; ports only |
| `supabase/.temp/linked-project.json` | `tchaye****xlvfu` | name=`shalean-platform` | ignored (`.temp`) | **Stale** | mtime **2026-07-13 22:47**; parent project metadata left behind |
| `supabase/.temp/project-ref` | `hborcp****jnfei` | _(CLI active link target)_ | ignored | **Authoritative for `--linked`** | mtime **2026-07-14 14:04**; equals apps/web `.env.local` `SUPABASE_PROJECT_REF` |
| `supabase/.temp/pooler-url` | user embeds `hborcp****`; host `aws-0-eu-west-3.pooler.supabase.com` | pooler | ignored | Consistent with branch ref | Region host is **not** a project prefix; tenant identity is in DB role username |
| `supabase/.temp/postgres-version` | _(value `17.6.1.105`)_ | leftover | ignored | **Stale vs active ref** | Matches production projects API version; mtime aligns with `linked-project.json`, not `project-ref` |
| `apps/web/.env.local` | `hborcp****` | local web app | ignored | Dev/preview only | `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_PROJECT_REF` point at branch |
| `apps/web/.env.example` (working tree) | placeholder `YOUR_DEVELOPMENT_PROJECT_REF` | documentation template | tracked (dirty) | Placeholder only | No live refs; see Phase 7 |
| `apps/mobile/.env.local` | `tchaye****` | mobile local | ignored | Points at production URL | Not used by CLI `--linked` |
| `apps/customer-mobile/.env` | `tchaye****` | customer mobile | ignored | Points at production URL | Not used by CLI `--linked` |
| CLI `projects list` / MCP `list_projects` | `tchaye****`, `qpqn****` only | org inventory | N/A | Trusted inventory | Branch refs do **not** appear as top-level projects |
| MCP `list_branches` on `tchaye****` | `hborcp****` = branch `development`; `gfvdic****` = branch `staging`; default `main` = `tchaye****` | Preview branches | N/A | **High confidence** | `hborcp****`: `with_data=false`, parent=`tchaye****`, created 2026-07-14 |
| H01 / H01.5 / H02A docs | `tchaye****xlvfu` | production | tracked | Trusted documentary | Production identity approved for H02B targeting |
| Other worktree `.temp` dirs | `jdmumb****`, `qpqn****`, `utfvbt****` | other checkouts | outside this repo | Not this link | Confirmed multiple sibling checkouts; none currently hold `hborcp****` except this repo |

---

## Git State

| Item | Value |
|------|-------|
| Current branch | `staging` |
| Upstream | `origin/staging` (up to date) |
| HEAD | `99526d72fca841fdc189eaf33720655a564675b0` |
| `origin/main` | `99526d72fca841fdc189eaf33720655a564675b0` |
| `origin/staging` | `99526d72fca841fdc189eaf33720655a564675b0` |
| Local `main` | same SHA |
| `staging` vs `main` | **Same commit** — branch name differs only |
| Dirty tracked | `apps/web/.env.example`, `docs/registers/risk-register-phase-111c-privileges.md` |
| Untracked | H01/H01.5/H02A/H02B docs under `docs/audits/`, `docs/plans/`, `docs/runbooks/`, `docs/audits/sql/` |

H02 documentation was authored while checked out on `staging`, but content lands at the approved SHA tip shared with `main`.

### Safe transition plan (not executed in this task)

Because `staging` and `main` share the same SHA:

1. Preserve evidence: leave dirty/untracked files as-is (or copy docs snapshot outside the worktree if operator prefers).
2. `git checkout main` — non-destructive at identical SHA; carries uncommitted docs and `.env.example` dirty state.
3. Do **not** `reset`/`clean`/`stash -u` without path-scoped control.
4. Keep `apps/web/.env.example` dirty until separately classified and either restored or approved in a non-H02 commit.
5. Relink CLI only in a later authorized task after preserving `.temp` evidence copies.

---

## Supabase CLI State

| Item | Value |
|------|-------|
| CLI version | `2.109.1` |
| `.supabase/` in repo root | Missing |
| Parent `C:\Users\info\.supabase` | Telemetry/traces only (no project link) |
| Active `--linked` driver | `supabase/.temp/project-ref` → `hborcp****jnfei` |
| Stale metadata | `linked-project.json` still names production `shalean-platform` / `tchaye****` |
| Pooler region host | `eu-west-3` (compatible with parent region; does **not** by itself prove production) |

### What `--linked` actually targets

| Probe | Result |
|-------|--------|
| `migration list --linked` | Remote only `20260714010000`; eight Phase 1.11 local-only; **zero** archaeology versions |
| `db query --linked` | `auth.users=0`, `bookings=0`, schema objects present, `schema_migrations` count `1` |
| MCP `list_branches` | `hborcp****` = preview branch `development`, `with_data=false`, parent `tchaye****` |
| MCP SELECT on production `tchaye****` | `auth.users=167`, `bookings=432` |

```text
LINKED TARGET CONFIRMED AS NON-PRODUCTION
```

---

## `hborcp****` Analysis

| Question | Answer |
|----------|--------|
| What is it? | **Confirmed:** Supabase **preview / development branch database** of production project `tchaye****xlvfu` |
| Branch name | `development` |
| Git branch association | `development` |
| Parent | `tchaye****xlvfu` (`shalean-platform`) |
| Data clone | `with_data=false` → empty customers is **expected**, not proof that production is empty |
| Also present | Sibling preview `staging` → `gfvdic****` (not currently linked) |
| Appears in `projects list`? | **No** (branch refs omitted from top-level project inventory) |
| `get_project(hborcp****)` | `Project not found` (branch ID ≠ catalog project) |
| Match to `apps/web/.env.local`? | **Yes** — exact project-ref equality |

**Confidence:** **~98% confirmed** (Management API `list_branches` + matching CLI `.temp` + matching local env + empty data shape + migration-history shape).

**Security / operational impact:** Any H02B `migration repair` / `db push --linked` run in this state would mutate the **empty development branch**, not production — while operators might believe they were on production because `linked-project.json` still says `shalean-platform`. Residual risk of later accidental relink to wrong target, or confusion between Git branch `staging` and Supabase branch `staging` (`gfvdic****`).

---

## Linked Database Shape

| Check | `--linked` (`hborcp****`) | Trusted production (`tchaye****`) |
|-------|---------------------------|-----------------------------------|
| `current_database` | `postgres` | `postgres` |
| `current_user` | `postgres` | `postgres` |
| `server_version` | `17.6` | `17.6` |
| TimeZone | `UTC` | `UTC` |
| `auth.users` count | **0** | **167** |
| `public.bookings` count | **0** | **432** |
| `to_regclass` bookings / monthly_invoices / cleaner_payouts | present | present |
| Remote migration versions (CLI list) | 1 baseline only | _(not re-listed via `--linked` this task; H01 documented 12 archaeology + disjoint)_ |

---

## Comparison With H01/H01.5

| Evidence | Match? |
|----------|--------|
| Project name `shalean-platform` in stale `linked-project.json` | Name match only — **not** sufficient for identity |
| Production ref `tchaye****xlvfu` | Parent of linked branch; **not** current `--linked` target |
| Region `eu-west-3` | Pooler region host matches parent region |
| Live users/bookings | **Conflict** — linked empty vs production 167/432 |
| Migration archaeology (12 remote-only) | **Conflict** — linked shows archaeology **0** |
| Empty linked data ⇒ empty production? | **Rejected interpretation** — explained by `with_data=false` branch |

---

## Root Cause

**Confirmed root cause:**

1. A Supabase preview branch `development` (`hborcp****jnfei`) was created under production on **2026-07-14** with **no data clone**.
2. Local web development config (`apps/web/.env.local`) and CLI `project-ref` / pooler username were pointed at that branch.
3. `supabase/.temp/linked-project.json` was **not** refreshed and still advertises the parent production project name/ref — creating a **false production confidence signal**.
4. Progress-audit `--linked` observations (empty tables, baseline-only history) therefore measured the **preview branch**, not production.

**Probable contributing factors:** local development linking to the new branch; Git checkout remaining on branch name `staging` while Supabase also has a separate preview named `staging` (`gfvdic****`) — naming collision risk for operators.

---

## Required Remediation

### Repository remediation (later authorized)

- Checkout `main` (safe at identical SHA); keep H02 docs and `.env.example` evidence.
- Decide separately whether to restore or promote `.env.example` outside H02 commits.

### CLI link remediation (later authorized — do not run now)

1. Preserve copies of all `supabase/.temp/*` files as evidence.
2. Confirm target from `projects list`: `shalean-platform` / `tchaye****xlvfu` / `eu-west-3`.
3. Explicit operator confirmation before `supabase link`.
4. Avoid printing DB passwords.
5. Re-run SELECT identity probes; **stop** if `auth.users` / `bookings` remain implausibly zero vs known production.
6. Re-run `migration list --linked`; compare to H01/H01.5 archaeology set.
7. No repair / push / baseline SQL.

### Environment configuration remediation

- Keep `apps/web/.env.local` on the development branch **or** document clearly that it must never be used as production CLI identity.
- Do not treat mobile apps’ production URLs as proof of CLI link target.

### Documentation remediation

- This investigation + updated Go/No-Go + progress status (done in this task).
- Mark identity gate FAIL until relink + re-probe.

### Operational prerequisites (unchanged)

- PITR, dual approval, maintenance window, smoke owners — still pending.

---

## Hard Stop Conditions

All existing H02B hard stops remain in force, including:

- Wrong or ambiguous linked identity
- Rejected project `qpqn****ejrb` usage
- Empty/implausible customer data treated as production
- Any repair/push/`--include-all`/baseline SQL without GO

**New explicit stop:** Do not treat `linked-project.json` project **name** as proof of `--linked` target when `project-ref` differs.

---

## Decision

```text
WRONG TARGET CONFIRMED — H02B BLOCKED
```

H02B remains **NO-GO**. Next authorized work: safe production relink + read-only re-verification, plus repository gate cleanup (`checkout main`, segregate `.env.example`).
