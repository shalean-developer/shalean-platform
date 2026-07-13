# Local Replay Verification — Phase 1B Final

**Status:** COMPLETE  
**Verdict:** **PASS WITH FINDINGS**  
**Date:** 2026-07-14  
**Branch:** `chore/database-schema-baseline`  
**Local DB:** `postgresql://postgres@127.0.0.1:54322/postgres` (`supabase_db_shalean-platform`)  
**Compared to:** `docs/database-baseline/processed-baseline-review.md`  
**Draft under test:** `docs/database-baseline/processed-production-baseline-draft.sql`

## Explicit non-actions (this phase)

- No production database access or remote SQL.
- No `db push` / `db pull` / `migration repair` / `db reset`.
- No changes to `supabase/migrations`.
- No modifications to the processed baseline draft.
- No commits.

This report only queries the already-replayed **local** database and writes this markdown file.

---

## Verdict summary

Local catalog state matches the processed baseline review for all primary object-class targets that define replay success (tables, views, matviews, policies, RLS enablement, triggers, enums, sequences, realtime publication membership, auth.users FKs).

Two numeric deltas versus earlier assessment language are **explained and expected**:

1. `pg_indexes` = **629** vs assessment **~402** → measurement definition difference (see below).
2. Functions = **105** signatures vs review **104** unique names → one overloaded function (see below).

Residual security posture items from the review (DEFINER `search_path`, broad grants, RLS-without-policy tables) remain present after replay as designed (draft did not harden them). They are findings, not replay failures.

---

## Comparison matrix (review / manual → local)

| Check | Review / prior | Manual verify | Local query | Match |
|-------|---------------:|--------------:|------------:|:-----:|
| Public tables | 173 | 173 | **173** | Yes |
| Views | 13 | 13 | **13** | Yes |
| Materialized views | 2 | 2 | **2** | Yes |
| Sequences | 1 | — | **1** | Yes |
| Enums | 3 | — | **3** | Yes |
| Functions (unique names) | 104 | — | **104** | Yes |
| Functions (signatures) | — | 105 | **105** | Yes (overload) |
| Triggers (distinct objects) | 29 | 29 | **29** | Yes |
| Policies | 113 | 113 | **113** | Yes |
| RLS-enabled tables | 173 | 173 | **173** | Yes |
| Realtime public tables | 5 | 5 | **5** | Yes |
| FK constraints (public) | — | — | **206** | — |
| FK → `auth.users` (public) | 44 refs in draft | — | **44** | Yes |
| PK constraints | — | — | **173** | — |
| UNIQUE constraints | — | — | **54** | — |
| Indexes (`pg_indexes`) | 402 *CREATE INDEX stmts* | 629 | **629** | Explained |
| Backup tables | excluded | — | **0** | Yes |
| Seeded prod row data | none | — | **0** on spot-check | Yes |

### Realtime publication membership (`supabase_realtime`)

1. `public.bookings`
2. `public.cleaner_booking_track_points`
3. `public.dispatch_offers`
4. `public.recurring_bookings`
5. `public.team_members`

### Extensions present locally

| Extension | Installed schema (local) |
|-----------|--------------------------|
| `pg_cron` | `pg_catalog` |
| `pg_net` | `extensions` *(draft specified `public`; local/image placement differs — functional)* |
| `pg_stat_statements` | `extensions` |
| `pgcrypto` | `extensions` |
| `supabase_vault` | `vault` |
| `uuid-ossp` | `extensions` |

---

## Constraints, indexes, grants (local)

| Category | Local count |
|----------|------------:|
| PRIMARY KEY | 173 |
| FOREIGN KEY | 206 |
| UNIQUE | 54 |
| CHECK | 1543 |
| Indexes total (`pg_indexes` / `pg_index`) | 629 |
| — primary indexes | 173 |
| — unique non-PK indexes | 116 |
| — non-unique indexes | 340 |
| Table privileges to `anon` (SELECT rows in `role_table_grants`) | 164 |
| Table privileges to `authenticated` (SELECT) | 166 |
| RLS enabled with **zero** policies | 92 |

Grants remain broad (aligned with processed baseline review). Replay did not introduce a least-privilege model.

---

## Why `pg_indexes` reports 629 (vs earlier ~402)

The earlier assessment counted **`CREATE INDEX` / `CREATE UNIQUE INDEX` statements in the SQL dump**, not live catalog indexes.

From the processed draft SQL:

| Statement class in draft | Count |
|--------------------------|------:|
| `CREATE [UNIQUE] INDEX …` | **402** |
| — of which `CREATE UNIQUE INDEX` | 62 |
| — of which non-unique `CREATE INDEX` | 340 |
| `ADD CONSTRAINT … PRIMARY KEY` | **173** |
| `ADD CONSTRAINT … UNIQUE` | **54** |

PostgreSQL also creates indexes for PK and UNIQUE **constraints**. Those are **not** `CREATE INDEX` statements in the dump, but they **do** appear in `pg_indexes`.

Reconciliation:

```text
402  (explicit CREATE INDEX statements)
+173 (PRIMARY KEY → indexes)
+ 54 (UNIQUE constraints → indexes)
= 629  (pg_indexes for schemaname = 'public')
```

Live catalog classification confirms the same total:

- primary indexes: 173  
- unique non-PK indexes: 116 (= 54 unique-constraint indexes + 62 `CREATE UNIQUE INDEX`)  
- non-unique indexes: 340  
- **total: 629**

**Conclusion:** 629 is correct for catalog reality. 402 was a correct count of a *subset* of index-creating DDL. Neither number indicates replay corruption.

---

## Why functions are 105 vs 104

| Metric | Value |
|--------|------:|
| Distinct function names in `public` | **104** |
| Total function signatures (`pg_proc` / create stmts) | **105** |

The single overload is:

| Name | Signatures |
|------|------------|
| `public.admin_whatsapp_reliability_metrics` | `(p_since timestamptz)` **and** `(p_since timestamptz, p_until timestamptz)` |

This matches the processed draft (`CREATE FUNCTION` twice for the same name; earlier process notes also flagged this duplicate/overload). Manual “105 functions” counted signatures; the review’s “104” counted unique names.

**Conclusion:** Expected; not an extra unexplained function.

---

## Triggers: 29 vs 35 rows

- **29** distinct triggers (table + trigger name) — matches review and manual verify.  
- **35** rows in `information_schema.triggers` because PostgreSQL lists **one row per event** (`INSERT` / `UPDATE` / `DELETE`). Several triggers are multi-event (e.g. `bookings_touch_became_pending_at_trg` → INSERT,UPDATE).

---

## Confirmation checks

### No production data

| Evidence | Result |
|----------|--------|
| `pg_stat_user_tables` public tables with `n_live_tup > 0` | **0** |
| Exact `count(*)` on `bookings`, `user_profiles`, `payment_transactions`, `cleaner_payment_details`, `monthly_invoices`, `cleaners`, `cron_http_targets` | **all 0** |

No customer/payment production rows are present in the local replay.

### Backup tables removed

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'blog_posts_draft_backup%';
-- 0 rows
```

### `OWNER TO` statements removed

| Check | Result |
|-------|--------|
| `OWNER TO` in processed draft SQL body | **0** (validated in draft generation) |
| Local public table owners | All **173** owned by `postgres` (normal when applied as role `postgres`; not evidence of residual dump ownership DDL) |

---

## Alignment with known review findings (not replay defects)

These remain as documented baseline posture issues:

1. **78 SECURITY DEFINER functions without pinned `search_path`** — unchanged by design in the draft.  
2. **Broad `GRANT` to `anon` / `authenticated`** — still present locally.  
3. **92 tables with RLS enabled and no policies** — deny-by-default for non-bypass roles; matches review (~92 after backup removal).  
4. **`pg_net` schema placement** — draft used `WITH SCHEMA "public"`; local install is in `extensions`. Extension is available; note for future baseline hardening if schema pinning matters to callers.

---

## Method

Read-only SQL against local container `supabase_db_shalean-platform` via `docker exec … psql`. Cross-checked statement class counts by parsing `docs/database-baseline/processed-production-baseline-draft.sql`. Compared totals to `docs/database-baseline/processed-baseline-review.md` and the Phase 1B manual verification list.

---

## Remaining blockers (outside this verification)

These do **not** fail Phase 1B replay verification, but still gate later work:

1. Wire a 14-digit baseline into `supabase/migrations` (approved plan required).  
2. Decide archive/quarantine strategy for the 428 historical migrations.  
3. Optional hardening: DEFINER `search_path`, least-privilege grants.  
4. Ops config after environments stand up: `cron_http_targets` placeholders, cron schedules, storage buckets (not in dump).

---

## Final verdict

# PASS WITH FINDINGS

Replay fidelity to the processed production baseline is confirmed. Index and function count deltas are fully explained. No production data, no backup tables, and no residual ownership reassignment statements from the dump path. Findings retained from the review document (DEFINER search_path, broad grants, RLS-without-policy, `pg_net` schema placement) are accepted residuals for a later hardening phase.
