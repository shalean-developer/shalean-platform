import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyAttentionQueue } from "@/lib/admin/opsSnapshot";
import { hasBookingAssignee } from "@/lib/dispatch/assignmentTruth";

const myWorkSource = readFileSync(
  new URL("../../../app/api/admin/my-work/route.ts", import.meta.url),
  "utf8",
);

function opsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    status: "confirmed",
    date: "2026-08-08",
    time: "09:00:00",
    cleaner_id: null,
    team_id: null,
    dispatch_status: "searching",
    became_pending_at: null,
    created_at: "2026-08-08T05:00:00.000Z",
    total_paid_zar: 500,
    amount_paid_cents: 50_000,
    ...overrides,
  };
}

describe("P2 final booking assignee source of truth", () => {
  it("treats either a solo cleaner or a team as a final assignee", () => {
    expect(hasBookingAssignee({ cleaner_id: "cleaner-1", team_id: null })).toBe(true);
    expect(hasBookingAssignee({ cleaner_id: null, team_id: "team-1" })).toBe(true);
    expect(hasBookingAssignee({ cleaner_id: null, team_id: null })).toBe(false);
  });

  it("keeps individually assigned bookings out of Operations unassigned attention", () => {
    expect(classifyAttentionQueue(opsRow({ cleaner_id: "cleaner-1" }) as any)).toBeNull();
  });

  it("keeps team-assigned bookings out of Operations unassigned attention", () => {
    expect(classifyAttentionQueue(opsRow({ team_id: "team-1" }) as any)).toBeNull();
  });

  it("makes My Work consume the same canonical final-assignee predicate", () => {
    expect(myWorkSource).toContain('import { hasBookingAssignee } from "@/lib/dispatch/assignmentTruth"');
    expect(myWorkSource).toContain("hasBookingAssignee(row)");
    expect(myWorkSource).toContain("cleaner_id?: string | null");
    expect(myWorkSource).not.toContain("row.id && !row.team_id");
  });
});
