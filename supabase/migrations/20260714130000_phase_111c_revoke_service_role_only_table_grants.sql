-- Phase 1.11C — Revoke anon/authenticated table grants on service_role-only relations
-- Audit: F-SEC-005 / DEBT-DB-004
--
-- Repository evidence: these tables are only accessed via getSupabaseAdmin() /
-- edge service_role / RPCs. Client roles retained GRANT ALL (incl. TRUNCATE) while
-- RLS often denied access — defense-in-depth revoke removes privilege surface.
--
-- DOES NOT touch customer/marketing/cleaner relations that have authenticated or
-- public RLS policies used by browser/RSC clients (bookings, blog_*, user_*, etc.).

BEGIN;

DO $$
DECLARE
  t text;
  service_only text[] := ARRAY[
    -- Admin idempotency / money control plane
    'admin_api_idempotency',
    'admin_billing_idempotency',
    'admin_booking_create_idempotency',
    'admin_earnings_actions',
    'admin_money_action_proposals',
    'admin_request_dedupe',
    -- Accounting sync
    'accounting_invoice_sync',
    'accounting_sync_records',
    -- AI / ML ops
    'ai_decision_logs',
    'ai_experiment_exposures',
    'ai_feature_store',
    'ai_model_weights',
    -- Observability
    'system_logs',
    'system_metrics',
    -- Cron control plane (DB secrets + leases)
    'cron_http_targets',
    'cron_run_leases',
    'cron_runs',
    -- WhatsApp queue / logs
    'whatsapp_queue',
    'whatsapp_logs',
    'whatsapp_delivery_events',
    'whatsapp_inbound_feedback_dedupe',
    'whatsapp_cleaner_unmatched_intent_log',
    -- Notification audit / runtime
    'notification_logs',
    'notification_alerts',
    'notification_idempotency_claims',
    'notification_runtime_flags',
    -- Payout rails (API/webhook/service_role)
    'payout_audit_events',
    'payout_transfer_outbox',
    'payout_transfers',
    'earnings_disbursement_transfers',
    'cleaner_payout_runs',
    -- Job / conversion / dispatch internals
    'failed_jobs',
    'conversion_deferred_payment_link_emails',
    'conversion_experiment_results',
    'conversion_experiments',
    'dispatch_logs',
    'dispatch_metrics',
    'dispatch_retry_queue',
    'dispatch_offer_exposure_dedupe',
    'dispatch_offer_timeout_metric_emitted',
    'dispatch_experiment_snapshots',
    -- Booking ops queues / audit (not customer browser .from)
    'booking_changes',
    'booking_demand_events',
    'booking_events',
    'booking_lifecycle_jobs',
    'booking_payment_recovery_jobs',
    'booking_roster_member_payouts',
    'booking_service_checklists',
    'booking_service_photos',
    'booking_team_assignments',
    'team_job_member_payouts',
    'team_daily_capacity_usage',
    -- Cleaner ops internals
    'cleaner_applications',
    'cleaner_job_issue_reports',
    'cleaner_job_issue_report_idempotency',
    'cleaner_job_lifecycle_idempotency',
    -- Finance / expense (deny policies + admin API only)
    'business_health_scores',
    'expense_accounts',
    'expense_approval_events',
    'expense_approval_limits',
    'expense_categories',
    'expense_vendors',
    'expenses',
    'recurring_expenses',
    'finance_budget_lines',
    'finance_budgets',
    'finance_chart_of_accounts',
    'finance_notifications',
    'payment_transactions',
    'zoho_integration_settings',
    -- Marketing automation / spend / email campaigns
    'email_campaigns',
    'email_campaign_sends',
    'growth_action_outcomes',
    'growth_customer_touch',
    'lifecycle_email_metrics',
    'lifecycle_email_settings',
    'marketing_automation_rules',
    'marketing_spend',
    'newsletter_subscribers',
    'campaign_assets',
    'campaign_content',
    'campaign_templates',
    -- Pricing / promo config audits (catalog SELECT preserved on pricing_services/extras)
    'pricing_booking_config',
    'pricing_catalog_audit',
    'pricing_changes',
    'pricing_metrics',
    'pricing_rules',
    'pricing_slot_adjustments',
    'pricing_versions',
    'promotion_audit_log',
    'promotion_events',
    'service_earning_caps',
    -- SEO / GSC / social publishing (admin APIs)
    'location_gsc_metrics',
    'location_gsc_queries',
    'location_gsc_sync_meta',
    'seo_auto_hub_ui_patch',
    'seo_auto_title_variant',
    'seo_insights_recommendations',
    'social_accounts',
    'social_publish_history',
    -- Misc ops
    'customer_contact_health',
    'customer_segment',
    'city_configs',
    'cities',
    'monthly_invoice_events',
    'monthly_invoice_paystack_charge_dedup',
    'sales_document_paystack_charge_dedup',
    'payment_link_delivery_events',
    'referral_program_settings',
    'referral_submissions',
    'review_sms_prompt_queue',
    'subscriptions',
    'templates',
    'travel_route_cache',
    'user_behavior',
    'user_events',
    'cleaning_credit_transactions',
    'data_retention_settings'
  ];
BEGIN
  FOREACH t IN ARRAY service_only
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'phase_111c skip missing table: %', t;
      CONTINUE;
    END IF;

    -- Why: eliminate client-role privilege on service_role-only relations (F-SEC-005).
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    -- Why: preserve app server / edge / cron access path.
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

COMMIT;
