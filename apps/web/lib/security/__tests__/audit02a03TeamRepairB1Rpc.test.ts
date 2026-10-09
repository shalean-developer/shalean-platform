import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("A02-03-02B1 atomic repair allowlist expansion", () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "../../supabase/migrations/20261009143000_audit_02a03_02b1_e865_team_line_items_allowlist.sql",
    ),
    "utf8",
  );

  it("adds only e865 to the proven atomic repair boundary", () => {
    expect(sql).toContain("d860554e-c132-477b-bf15-557fb9c88a5e");
    expect(sql).toContain("f6b2316e-2518-4f43-b6e8-b050c6d07483");
    expect(sql).toContain("e865f74b-33af-481f-a12e-576e1e0ed227");
    expect(sql).not.toContain("fc75a013-5858-43e8-b499-3aa2ab047bcf");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
    expect(sql).toContain("historical_team_snapshot_v1");
    expect(sql).toContain("v_existing_payload = v_requested_payload");
    expect(sql).toContain("grant execute on function public.repair_a02_03_02_team_line_items");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect((sql.match(/create or replace function public\.repair_a02_03_02_team_line_items/g) ?? []).length).toBe(1);
    expect((sql.match(/\$a02_03_02\$/g) ?? []).length).toBe(2);
    expect((sql.match(/return 'inserted';/g) ?? []).length).toBe(1);
  });
});
