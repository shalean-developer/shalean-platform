import { describe, expect, it } from "vitest";
import { deriveCleanerJobLifecycleSlot } from "@/lib/cleaner/cleanerMobileBookingMap";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";

function baseRow(over: Partial<CleanerBookingRow>): CleanerBookingRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    service: "Standard",
    date: "2026-04-30",
    time: "09:00",
    location: "Test",
    status: "assigned",
    total_paid_zar: 0,
    customer_name: "A",
    customer_phone: "0",
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: null,
    created_at: null,
    is_team_job: false,
    cleaner_id: "00000000-0000-4000-8000-000000000002",
    ...over,
  };
}

describe("deriveCleanerJobLifecycleSlot", () => {
  it("treats blank cleaner_response_status as not accepted (solo assigned)", () => {
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: null }))).toEqual({
      kind: "accept_reject",
      canReject: true,
    });
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "" }))).toEqual({
      kind: "accept_reject",
      canReject: true,
    });
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "none" }))).toEqual({
      kind: "accept_reject",
      canReject: true,
    });
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "pending" }))).toEqual({
      kind: "accept_reject",
      canReject: true,
    });
  });

  it("after accept without travel shows en_route", () => {
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "accepted" }))).toEqual({
      kind: "en_route",
    });
  });

  it("after on_my_way or en_route_at shows start", () => {
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "on_my_way" }))).toEqual({
      kind: "start",
    });
    expect(
      deriveCleanerJobLifecycleSlot(
        baseRow({ cleaner_response_status: "accepted", en_route_at: "2026-04-30T08:00:00.000Z" }),
      ),
    ).toEqual({ kind: "start" });
  });
});
