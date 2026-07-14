# Processed Production Schema Baseline — Review

**Status:** DRAFT FOR REVIEW ONLY  
**Branch:** `chore/database-schema-baseline`  
**Generated:** 2026-07-13T22:41:22.462Z  
**Production project reference (context only):** `tchayecuvzssixyxlvfu`

## Explicit non-actions

- No production database connection or remote SQL was executed.
- No `db push`, `db pull`, `migration repair`, or `db reset` was run.
- No files under `supabase/migrations` were modified, moved, renamed, deleted, or archived.
- No commit was created.
- The draft was **not** applied to any database.

## Files

| Role | Path |
|------|------|
| Source | `docs/database-baseline/production-schema-source.sql` |
| Processed draft | `docs/database-baseline/processed-production-baseline-draft.sql` |
| This review | `docs/database-baseline/processed-baseline-review.md` |

## Hashes (SHA-256)

| File | SHA-256 |
|------|---------|
| Source | `9301dd5a6e168e1a570f19f029675e1475fcd0f0efa91a4f1f50f55a50b14af7` |
| Processed draft | `4f866299d2419478a7193455516ce083d479502d406c02f2ad2a884809e7ddd8` |

## Preprocessing actions performed

1. Removed **all** `OWNER TO` statements (300 statements dropped).
2. Excluded **all** statements referencing `blog_posts_draft_backup_*` (10 statements dropped), including CREATE/ALTER/COMMENT/INDEX/CONSTRAINT/RLS/GRANT.
3. Preserved remaining public-schema DDL: extensions, enums/types, tables, sequences, defaults, constraints, indexes, views, materialized views, functions, triggers, RLS enablement, policies, grants, realtime publication membership.
4. Preserved foreign keys referencing `"auth"."users"` (**44** `REFERENCES` occurrences in draft).
5. Did **not** introduce top-level `INSERT`/`COPY` data statements. (SQL text matching `INSERT INTO` may still appear **inside function bodies** as runtime DML — that is schema logic, not seeded production data.)
6. Did **not** replace `YOUR_DOMAIN` / `YOUR_CRON_SECRET` placeholders.
7. Did **not** invent storage buckets, cron schedules, auth users, secrets, or env-specific values.
8. Left `SECURITY DEFINER` function bodies/headers unchanged (findings listed below).

## Objects removed

### Backup tables excluded

- `public.blog_posts_draft_backup_202609`
- `public.blog_posts_draft_backup_20260910`

### Counts: before → after

| Object kind | Before | After | Delta |
|-------------|-------:|------:|------:|
| Extensions | 6 | 6 | 0 |
| Enums | 3 | 3 | 0 |
| Tables | 175 | 173 | -2 |
| Sequences | 1 | 1 | 0 |
| Views | 13 | 13 | 0 |
| Materialized views | 2 | 2 | 0 |
| Functions (unique names) | 104 | 104 | 0 |
| Indexes (create stmts matched) | 402 | 402 | 0 |
| Triggers | 29 | 29 | 0 |
| RLS enabled tables | 175 | 173 | -2 |
| Policies | 113 | 113 | 0 |
| OWNER TO statements | 300 (source) | 0 | removed |

Tables removed (expect exactly the two backups):  
- `public.blog_posts_draft_backup_202609`
- `public.blog_posts_draft_backup_20260910`

## SECURITY DEFINER — functions without pinned `search_path`

Total `SECURITY DEFINER` functions detected in draft headers: **78**  
Without `SET search_path` / `SET search_path TO` in the function header: **78**

> Note: Per instructions, DEFINER functions were **not** modified in this draft. Pinning `search_path` is a recommended follow-up hardening step before production use of the baseline.

- `public.accept_dispatch_offer_atomic`
- `public.add_team_members_guarded`
- `public.admin_billing_switch_finalize`
- `public.admin_mark_payout_paid`
- `public.admin_whatsapp_reliability_metrics`
- `public.append_booking_conversion_analytics`
- `public.apply_cleaning_credit_transaction`
- `public.approve_cleaner_change_request`
- `public.assign_team_and_sync_roster`
- `public.bookings_after_write_monthly_invoice`
- `public.bookings_before_delete_monthly_invoice`
- `public.bookings_lock_under_finalized_monthly_invoice`
- `public.bookings_record_payment_link_delivery`
- `public.claim_booking_dispatch_recovery_lease`
- `public.claim_booking_earnings_recompute`
- `public.claim_cleaner_earnings_for_paystack`
- `public.claim_team_capacity_slot`
- `public.dispatch_cleaner_offer_accepted`
- `public.dispatch_cleaner_offer_sent`
- `public.dispatch_expire_peer_offers`
- `public.dispatch_record_offer_response`
- `public.enqueue_stranded_pending_bookings`
- `public.expire_old_offers`
- `public.expire_pending_dispatch_offers`
- `public.increment_monthly_invoice_reminder_count`
- `public.increment_promotion_redemption_counters`
- `public.increment_user_profile_stats`
- `public.initialize_customer_draft_booking`
- `public.invoice_adjustments_after_insert_route`
- `public.invoice_adjustments_block_if_month_closed`
- `public.invoke_nextjs_cron`
- `public.link_booking_to_user`
- `public.list_bookings_due_user_selected_recovery`
- `public.mark_bookings_paid_for_cleaner_payout`
- `public.mark_bookings_paid_for_earnings_disbursement`
- `public.mark_monthly_invoice_overdue_flags`
- `public.monthly_invoice_append_snapshot_event`
- `public.monthly_invoice_hard_close`
- `public.monthly_invoice_last_event_times`
- `public.monthly_invoices_after_status_paid_append_closed`
- `public.monthly_invoices_append_invoice_closed_event`
- `public.monthly_invoices_stamp_adjustments_applied_at`
- `public.notification_system_logs_daily`
- `public.notification_system_logs_summary`
- `public.populate_daily_analytics_rollups`
- `public.prune_cleaner_job_lifecycle_idempotency`
- `public.prune_dispatch_offer_exposure_dedupe`
- `public.prune_short_lived_notification_idempotency_claims`
- `public.prune_system_logs`
- `public.public_marketing_reviews_for_area`
- `public.public_review_banner_stats`
- `public.purge_stale_pending_payment_bookings`
- `public.recalculate_user_tier`
- `public.recompute_monthly_invoice_totals`
- `public.record_monthly_invoice_view`
- `public.record_sales_document_view`
- `public.refresh_analytics_materialized_views`
- `public.refresh_cleaner_rating`
- `public.refresh_dispatch_experiment_snapshots`
- `public.release_cron_lock`
- `public.release_team_capacity_slot`
- `public.repair_empty_team_booking_rosters`
- `public.replace_booking_cleaners_admin_atomic`
- `public.replace_booking_line_items_atomic`
- `public.resolve_admin_monthly_booking_race`
- `public.resolve_auth_user_id_by_email`
- `public.retry_unassigned_jobs`
- `public.run_analytics_warehouse_nightly`
- `public.run_dispatch_cycle`
- `public.sync_booking_cleaners_for_team_booking`
- `public.sync_promotion_statuses`
- `public.touch_payout_integrity_first_seen`
- `public.trg_bookings_completed_refresh_tier`
- `public.trg_reviews_refresh_cleaner`
- `public.try_acquire_cron_lock`
- `public.user_has_booking_with_cleaner`
- `public.user_owns_booking`
- `public.user_profiles_prevent_customer_billing_change`

## Broad GRANT ALL findings (`anon` / `authenticated`)

Count of `GRANT ALL ON {TABLE|SEQUENCE|FUNCTION} … TO "anon"|"authenticated"` statements in draft: **326**

| Role | GRANT ALL count |
|------|----------------:|
| anon | 164 |
| authenticated | 162 |

Also present: `ALTER DEFAULT PRIVILEGES … GRANT ALL ON {TABLES|SEQUENCES|FUNCTIONS} TO anon/authenticated` (see tail of draft).

**Interpretation:** Supabase dumps commonly grant ALL to `anon`/`authenticated` and rely on RLS. Combined with RLS-without-policy tables (next section), many tables remain inaccessible to those roles despite GRANT ALL. Optional follow-up: least-privilege grants after local validation.

### Sample (first 25)

| Object type | Object | Role |
|-------------|--------|------|
| TABLE | `public.bookings` | anon |
| TABLE | `public.bookings` | authenticated |
| TABLE | `public.whatsapp_queue` | anon |
| TABLE | `public.whatsapp_queue` | authenticated |
| TABLE | `public.accounting_invoice_sync` | anon |
| TABLE | `public.accounting_invoice_sync` | authenticated |
| TABLE | `public.accounting_sync_records` | anon |
| TABLE | `public.accounting_sync_records` | authenticated |
| TABLE | `public.admin_api_idempotency` | anon |
| TABLE | `public.admin_api_idempotency` | authenticated |
| TABLE | `public.admin_billing_idempotency` | anon |
| TABLE | `public.admin_billing_idempotency` | authenticated |
| TABLE | `public.admin_booking_create_idempotency` | anon |
| TABLE | `public.admin_booking_create_idempotency` | authenticated |
| TABLE | `public.cleaning_credit_transactions` | anon |
| TABLE | `public.cleaning_credit_transactions` | authenticated |
| TABLE | `public.referral_discount_redemptions` | anon |
| TABLE | `public.referral_discount_redemptions` | authenticated |
| TABLE | `public.admin_earnings_actions` | anon |
| TABLE | `public.admin_earnings_actions` | authenticated |
| TABLE | `public.referral_events` | anon |
| TABLE | `public.referral_events` | authenticated |
| TABLE | `public.admin_money_action_proposals` | anon |
| TABLE | `public.admin_money_action_proposals` | authenticated |
| TABLE | `public.admin_request_dedupe` | anon |

## RLS enabled but zero policies

Tables with `ENABLE ROW LEVEL SECURITY` and **no** `CREATE POLICY` in the draft: **92**

- `public.admin_api_idempotency`
- `public.admin_billing_idempotency`
- `public.admin_booking_create_idempotency`
- `public.admin_earnings_actions`
- `public.admin_money_action_proposals`
- `public.admin_request_dedupe`
- `public.ai_decision_logs`
- `public.ai_experiment_exposures`
- `public.ai_feature_store`
- `public.ai_model_weights`
- `public.booking_changes`
- `public.booking_demand_events`
- `public.booking_events`
- `public.booking_lifecycle_jobs`
- `public.booking_payment_recovery_jobs`
- `public.booking_roster_member_payouts`
- `public.booking_service_checklists`
- `public.booking_service_photos`
- `public.booking_team_assignments`
- `public.cities`
- `public.city_configs`
- `public.cleaner_applications`
- `public.cleaner_job_issue_report_idempotency`
- `public.cleaner_job_issue_reports`
- `public.cleaner_job_lifecycle_idempotency`
- `public.cleaner_payout_runs`
- `public.cleaning_credit_transactions`
- `public.conversion_deferred_payment_link_emails`
- `public.conversion_experiment_results`
- `public.conversion_experiments`
- `public.cron_http_targets`
- `public.cron_run_leases`
- `public.cron_runs`
- `public.customer_contact_health`
- `public.customer_segment`
- `public.dispatch_experiment_snapshots`
- `public.dispatch_logs`
- `public.dispatch_offer_exposure_dedupe`
- `public.dispatch_offer_timeout_metric_emitted`
- `public.dispatch_retry_queue`
- `public.earnings_disbursement_transfers`
- `public.email_campaign_sends`
- `public.email_campaigns`
- `public.failed_jobs`
- `public.growth_action_outcomes`
- `public.growth_customer_touch`
- `public.lifecycle_email_metrics`
- `public.lifecycle_email_settings`
- `public.marketing_automation_rules`
- `public.marketing_spend`
- `public.monthly_invoice_events`
- `public.monthly_invoice_paystack_charge_dedup`
- `public.newsletter_subscribers`
- `public.notification_alerts`
- `public.notification_idempotency_claims`
- `public.notification_logs`
- `public.notification_runtime_flags`
- `public.payment_link_delivery_events`
- `public.payout_audit_events`
- `public.payout_transfer_outbox`
- `public.payout_transfers`
- `public.pricing_booking_config`
- `public.pricing_catalog_audit`
- `public.pricing_changes`
- `public.pricing_metrics`
- `public.pricing_rules`
- `public.pricing_slot_adjustments`
- `public.pricing_versions`
- `public.promotion_audit_log`
- `public.promotion_events`
- `public.promotion_redemptions`
- `public.referral_program_settings`
- `public.referral_submissions`
- `public.review_sms_prompt_queue`
- `public.sales_document_paystack_charge_dedup`
- `public.service_earning_caps`
- `public.subscriptions`
- `public.system_logs`
- `public.system_metrics`
- `public.team_daily_capacity_usage`
- `public.team_job_member_payouts`
- `public.team_members`
- `public.teams`
- `public.templates`
- `public.travel_route_cache`
- `public.user_behavior`
- `public.user_events`
- `public.whatsapp_cleaner_unmatched_intent_log`
- `public.whatsapp_delivery_events`
- `public.whatsapp_inbound_feedback_dedupe`
- `public.whatsapp_logs`
- `public.whatsapp_queue`

**Interpretation:** With RLS on and no policy, `anon`/`authenticated` cannot read/write (except table owner / bypass roles such as `service_role` depending on configuration). Likely intentional for internal/ops tables — confirm during review.

## Replay-order assumptions

The draft preserves the source dump order, which is approximately:

1. Session `SET` boilerplate  
2. Extensions  
3. Enums / types  
4. Functions (many before tables in this dump — valid in PostgreSQL when bodies are not evaluated at create time with `check_function_bodies = false`)  
5. Tables + column defaults  
6. Sequences  
7. Constraints (PK/UK/CHECK/FK including `auth.users`)  
8. Indexes  
9. Views / materialized views (positions as in source)  
10. Triggers  
11. RLS enable + policies  
12. Grants / revokes / default privileges  
13. `ALTER PUBLICATION supabase_realtime ADD TABLE …`  

## Expected Supabase-local dependencies

A clean **Supabase local** stack (not bare Postgres) is required:

- Role set: `anon`, `authenticated`, `service_role`, `postgres`, etc.
- Schemas/extensions typically pre-provisioned: `auth`, `storage`, `realtime`, `extensions`, `vault` (as applicable)
- Relation `"auth"."users"` for **44** FK references
- Publication `"supabase_realtime"` for **5** `ADD TABLE` statements
- Extension privileges to create/ensure: `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`

Placeholders `YOUR_DOMAIN` / `YOUR_CRON_SECRET` remaining in `cron_http_targets` defaults and function guards are **intentional** — do not substitute production secrets into this draft.

## Unresolved risks / blockers before local replay approval

1. Extension creates targeting `pg_catalog` / `vault` / `extensions` may warn or no-op depending on local image — need observed apply log.  
2. `SECURITY DEFINER` without pinned `search_path` (78 functions) — security advisor debt; not fixed in this draft.  
3. Broad `GRANT ALL` to `anon`/`authenticated` retained — hardening deferred.  
4. Materialized views need `REFRESH` after apply for non-empty contents.  
5. No `cron.schedule` jobs and no storage buckets are in this draft (absent from source) — ops must configure separately.  
6. Historical `supabase/migrations` (428) still present and unreplayable — baseline is **not** wired into CLI history yet.  
7. Duplicate function name `admin_whatsapp_reliability_metrics` (if both CREATE OR REPLACE remain) — last definition wins; verify after apply.

## Validation results (static — draft not executed)

| Check | Result |
|-------|--------|
| `OWNER TO` remaining | **0** (must be 0) |
| `blog_posts_draft_backup_*` remaining | **PASS — absent** |
| Top-level `INSERT` statements | **0** |
| Top-level `COPY` statements | **0** |
| Project ref `tchayecuvzssixyxlvfu` in draft | **PASS — absent** |
| JWT-like literals | **PASS — absent** |
| `sk_live` / `sk_test` literals | **PASS — absent** |
| Placeholders preserved | **PASS** |
| `$function$` quote pairing even | **PASS** |
| Statement count (split) | 3010 |
| auth.users FK refs | 44 |
| Realtime ADD TABLE stmts | 5 |

## Exact commands for local replay validation (do not run until approved)

> Run only after explicit approval. These commands are for **local Docker Supabase**, never production.

```powershell
# From repo root — REVIEW/APPROVAL REQUIRED BEFORE RUNNING
# 1) Start local stack (does not touch production)
npx supabase start

# 2) Apply draft to local DB only via psql (example URL from supabase status)
#    Replace DB URL with output of: npx supabase status -o env
$env:PGPASSWORD = "<local_db_password_from_supabase_status>"
psql "postgresql://postgres:PASSWORD@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f docs/database-baseline/processed-production-baseline-draft.sql

# 3) Catalog smoke checks
psql "postgresql://postgres:PASSWORD@127.0.0.1:54322/postgres" -c "select count(*) as tables from information_schema.tables where table_schema='public' and table_type='BASE TABLE';"
psql "postgresql://postgres:PASSWORD@127.0.0.1:54322/postgres" -c "select tablename from pg_tables where schemaname='public' and tablename like 'blog_posts_draft_backup_%';"
psql "postgresql://postgres:PASSWORD@127.0.0.1:54322/postgres" -c "select count(*) from pg_policies where schemaname='public';"
```

**Do not** use `supabase db reset`, `db push`, `db pull`, or `migration repair` for this draft validation without a separate approved plan (those interact with migration history).

## Approval required

**Stopped after draft generation.**  

Approve before:

1. Running the local replay commands above  
2. Any `search_path` hardening edits to DEFINER functions  
3. Least-privilege grant tightening  
4. Adding a 14-digit migration into `supabase/migrations`  
5. Archiving the 428 historical migrations  
6. Any production history/schema operations
