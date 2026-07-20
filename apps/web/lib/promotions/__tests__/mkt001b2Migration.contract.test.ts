import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION = "20260717120000_mkt_001b2_social_publish_jobs.sql";

function readMigration(): string {
  // apps/web → repo root
  const root = join(process.cwd(), "..", "..");
  return readFileSync(join(root, "supabase", "migrations", MIGRATION), "utf8");
}

describe("MKT-001B.2 social_publish_jobs migration contract", () => {
  const sql = readMigration();

  it("creates social_publish_jobs with required columns and statuses", () => {
    expect(sql).toMatch(/create table if not exists public\.social_publish_jobs/i);
    expect(sql).toMatch(/idempotency_key/);
    expect(sql).toMatch(/next_attempt_at/);
    expect(sql).toMatch(/lease_holder/);
    expect(sql).toMatch(/lease_expires_at/);
    expect(sql).toMatch(/external_post_id/);
    expect(sql).toMatch(/dead_letter/);
    expect(sql).toMatch(/'queued'/);
    expect(sql).toMatch(/'leased'/);
    expect(sql).toMatch(/'retryable'/);
  });

  it("enforces active-key uniqueness and service-role RLS", () => {
    expect(sql).toMatch(/social_publish_jobs_active_key_uidx/i);
    expect(sql).toMatch(/where status in \('queued', 'leased', 'retryable'\)/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/auth\.role\(\) = 'service_role'/i);
    expect(sql).toMatch(/revoke all on table public\.social_publish_jobs from anon/i);
  });

  it("provides claim + lease recovery RPCs and pg_cron schedule", () => {
    expect(sql).toMatch(/claim_social_publish_jobs/i);
    expect(sql).toMatch(/for update skip locked/i);
    expect(sql).toMatch(/recover_expired_social_publish_leases/i);
    expect(sql).toMatch(/invoke_nextjs_cron\('\/api\/cron\/process-social-publish-jobs'\)/i);
    expect(sql).toMatch(/\*\/5 \* \* \* \*/);
    // MKT-001M.1: nested $$ is invalid; cron body must use a distinct tag.
    expect(sql).toMatch(/DO\s+\$do\$/i);
    expect(sql).toMatch(/\$cron\$select public\.invoke_nextjs_cron/i);
    expect(sql).toMatch(/END\s+\$do\$\s*;/i);
  });

  it("documents that payload must not store secrets", () => {
    expect(sql).toMatch(/No secrets \/ imageDataUrl \/ tokens/i);
  });
});
