import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "../../supabase/migrations/20260919153000_production_schema_convergence.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase();

describe("SUPA-MIG-08A production schema convergence", () => {
  it("preserves the production-only booking extras quantity map", () => {
    expect(sql).toContain("add column if not exists extra_quantities");
    expect(sql).toContain("selected_extras remains the backwards-compatible id array");
  });

  it("restores current-release runtime dependencies", () => {
    for (const marker of [
      "cleaner_early_finish_requests",
      "inventory_items",
      "inventory_movements",
      "inventory_equipment_issues",
      "fleet_vehicles",
      "transport_drivers",
      "transport_runs",
      "transport_stops",
      "transport_cost_entries",
      "sales_opportunity_activities",
      "settle_booking_fully_covered",
      "sync_booking_duration_columns",
      "owner_command_centre_analytics_rollup",
      "award_customer_referral_credit",
      "email_campaign_sends_idempotency_key_uidx",
    ]) {
      expect(sql).toContain(marker);
    }
  });

  it("reapplies the approved security-hardening posture before creating new runtime objects", () => {
    expect(sql).toContain("security_invoker = true");
    expect(sql).toContain("revoke truncate, references, trigger, maintain on all tables in schema public from anon");
    expect(sql).toContain("alter default privileges for role postgres in schema public");
    expect(sql).toContain("phase111a_deny_anon_auth_booking_service_photos");
    expect(sql).toContain("promotions_public_read_active");

    expect(sql.indexOf("approved default-privilege hardening")).toBeLessThan(
      sql.indexOf("inventory runtime dependency"),
    );
    expect(sql).toContain("revoke all on table public.booking_inventory_costs from anon, authenticated");
    expect(sql).toContain("revoke all on table public.transport_run_cost_summary from anon, authenticated");
    expect(sql).toContain("revoke all on table public.transport_fleet_summary from anon, authenticated");
  });

  it("preserves the approved 14-day system-log retention without scheduling pruning", () => {
    expect(sql).toMatch(/'system_logs',\s*14,\s*10000,\s*true/);
    expect(sql).toContain("on conflict (table_name) do update");
    expect(sql).not.toContain("cron.schedule(");
    expect(sql).not.toContain("insert into cron.job");
  });

  it("does not include explicitly excluded database changes", () => {
    for (const excluded of [
      "create table if not exists public.recurring_prepaid_packages",
      "create table if not exists public.recurring_prepaid_allocations",
      "supabase_migrations.schema_migrations",
      "greatest(now() + interval '10 minutes'",
      "array['email'::text, 'whatsapp'::text, 'sms'::text, 'push'::text]",
      "array['resend'::text, 'twilio'::text, 'meta'::text, 'expo'::text]",
    ]) {
      expect(sql).not.toContain(excluded);
    }
  });

  it("does not carry production cron target values", () => {
    expect(sql).not.toContain("https://your_domain");
    expect(sql).not.toContain("your_cron_secret");
    expect(sql).not.toContain("insert into public.cron_http_targets");
    expect(sql).not.toContain("update public.cron_http_targets");
  });

  it("omits historical CRM and review-prompt backfills", () => {
    expect(sql).toContain("historical crm stage/source backfill intentionally omitted");
    expect(sql).not.toContain("do not mass-message historical customers");
    expect(sql).not.toContain("greatest(now() + interval '24 hours'");
  });
});