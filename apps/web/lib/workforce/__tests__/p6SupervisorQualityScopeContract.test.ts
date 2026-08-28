import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (p: string) => fs.readFileSync(path.join(repoRoot, p), "utf8");

const scope = read("apps/web/lib/workforce/supervisorTeamScope.ts");
const perf = read("apps/web/app/api/admin/cleaner-performance/route.ts");
const qaList = read("apps/web/app/api/admin/quality/inspections/route.ts");
const qaDetail = read("apps/web/app/api/admin/quality/inspections/[id]/route.ts");

describe("P6 supervisor quality/performance scope", () => {
  it("resolves supervisor scope through admin role plus team lead/member rails", () => {
    expect(scope).toContain('admin_roles.code", "supervisor"');
    expect(scope).toContain('lead_cleaner_id');
    expect(scope).toContain('team_members');
    expect(scope).toContain('booking_cleaners');
  });

  it("keeps future-dated team membership endings active until they actually expire", () => {
    expect(scope).not.toContain('.is("active_to", null)');
    expect(scope).toContain("active_to?: string | null");
    expect(scope).toContain("if (row.active_to && row.active_to <= now) continue;");
  });

  it("scopes cleaner performance to supervisor cleaner IDs", () => {
    expect(perf).toContain("resolveSupervisorTeamScope");
    expect(perf).toContain("cleanerIds: supervisorScope.isSupervisor");
    expect(perf).toContain('return NextResponse.json({ error: "Forbidden." }, { status: 403 })');
  });

  it("prevents supervisors from inspecting or mutating bookings outside their team", () => {
    expect(qaList).toContain("bookingBelongsToSupervisorScope");
    expect(qaList).toContain("Supervisors can inspect only bookings assigned to their team.");
    expect(qaDetail).toContain("loadInspectionAndCheckScope");
    expect(qaDetail).toContain("bookingBelongsToSupervisorScope");
  });

  it("treats an explicit booking team as authoritative before roster fallback", () => {
    expect(scope).toContain("if (teamId) return scope.teamIds.includes(teamId);");
    expect(scope.indexOf("if (teamId) return scope.teamIds.includes(teamId);")).toBeLessThan(
      scope.indexOf('.from("booking_cleaners")'),
    );
    expect(scope).toContain("Legacy/solo bookings without an explicit team may still be scoped through");
  });
});
