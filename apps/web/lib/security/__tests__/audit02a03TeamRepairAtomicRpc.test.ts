import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("A02-03-02 atomic historical team repair RPC", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "../../supabase/migrations/20261009123000_audit_02a03_02_team_line_items_atomic_repair.sql"),
    "utf8",
  );

  it("is hard-bounded, atomic, and service-role only", () => {
    expect(sql).toContain("repair_a02_03_02_team_line_items");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
    expect(sql).toContain("d860554e-c132-477b-bf15-557fb9c88a5e");
    expect(sql).toContain("f6b2316e-2518-4f43-b6e8-b050c6d07483");
    expect(sql).toContain("a02_03_02_existing_line_items_conflict");
    expect(sql).toContain("already_repaired");
    expect(sql).toContain("metadata->>'sourceLineIndex'");
    expect(sql).toContain("v_existing_payload");
    expect(sql).toContain("v_requested_payload");
    expect(sql).toContain("jsonb_agg");
    expect(sql).toContain("jsonb_build_object");
    expect(sql).toContain("v_existing_payload = v_requested_payload");
    expect(sql).toContain("v_existing_index_count = v_expected_count");
    expect(sql).toContain("historical_team_snapshot_v1");
    expect(sql).toContain("grant execute on function public.repair_a02_03_02_team_line_items");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("revoke all on function public.repair_a02_03_02_team_line_items");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect((sql.match(/create or replace function public\.repair_a02_03_02_team_line_items/g) ?? []).length).toBe(1);
    expect((sql.match(/\$a02_03_02\$/g) ?? []).length).toBe(2);
    expect((sql.match(/return 'inserted';/g) ?? []).length).toBe(1);
    expect((sql.match(/comment on function public\.repair_a02_03_02_team_line_items/g) ?? []).length).toBe(1);
  });
});
