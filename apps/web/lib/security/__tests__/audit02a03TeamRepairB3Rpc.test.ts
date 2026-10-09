import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("A02-03-02B3 atomic repair allowlist expansion", () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "../../supabase/migrations/20261009163000_audit_02a03_02b3_c1bd_discount_line_items_allowlist.sql",
    ),
    "utf8",
  );

  it("adds only c1bd to the proven atomic repair boundary", () => {
    expect(sql).toContain("d860554e-c132-477b-bf15-557fb9c88a5e");
    expect(sql).toContain("f6b2316e-2518-4f43-b6e8-b050c6d07483");
    expect(sql).toContain("e865f74b-33af-481f-a12e-576e1e0ed227");
    expect(sql).toContain("d2cfcb8d-118f-48cc-90c7-420ffe122c9b");
    expect(sql).toContain("c1bd1fc8-03e9-4f2c-a597-e0ac395c841a");
    expect(sql).not.toContain("fc75a013-5858-43e8-b499-3aa2ab047bcf");
    expect(sql).not.toContain("073947f2-d37d-4852-9a2d-5bdd138d2440");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
    expect(sql.indexOf("return 'already_repaired';")).toBeLessThan(
      sql.indexOf("a02_03_02_b3_payout_state_mismatch"),
    );
    expect(sql).toContain("historical_team_snapshot_v1");
    expect(sql).toContain("v_existing_payload = v_requested_payload");
    expect(sql).toContain("a02_03_02_b3_live_snapshot_mismatch");
    expect(sql).toContain("a02_03_02_b3_payload_mismatch");
    expect(sql).toContain("a02_03_02_b3_payout_state_mismatch");
    expect(sql).toContain("a02_03_02_b3_roster_mismatch");
    expect(sql).toContain("a02_03_02_b3_payout_linkage_mismatch");
    expect(sql).toContain("v_b3_roster_payload");
    expect(sql).toContain("v_b3_payout_payload");
    expect(sql).toContain("from public.team_job_member_payouts tp");
    expect(sql).toContain("for update");
    expect(sql).toContain("45254fb5-c94d-45e5-afb3-88b696e389b1");
    expect(sql).toContain("b7054032-ad31-466f-86f6-13ab65005d3d");
    expect(sql).toContain("b9bcaf62-f50c-4323-b99a-0db039c6cdfd");
    expect(sql).toContain("v_b3_payout_count");
    expect(sql).toContain("v_b3_batched_count");
    expect(sql).toContain("v_b3_payout_count <> 3 or v_b3_batched_count <> 3");
    expect(sql).toContain("v_b3_expected_projection");
    expect(sql).toContain("v_b3_expected_payload");
    expect(sql).toContain("\"15% discount\"");
    expect(sql).toContain("-32100");
    expect(sql).toContain("\"inside-cabinets\"");
    expect(sql).toContain("\"interior-walls\"");
    expect(sql).toContain("grant execute on function public.repair_a02_03_02_team_line_items");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from anon");
    expect(sql).toContain("from authenticated");
    expect((sql.match(/create or replace function public\.repair_a02_03_02_team_line_items/g) ?? []).length).toBe(1);
    expect((sql.match(/\$a02_03_02\$/g) ?? []).length).toBe(2);
    expect((sql.match(/return 'inserted';/g) ?? []).length).toBe(1);
  });
});
