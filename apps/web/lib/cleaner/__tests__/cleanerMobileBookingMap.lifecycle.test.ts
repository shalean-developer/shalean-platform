import { describe, expect, it } from "vitest";
import {
  deriveCleanerJobLifecycleSlot,
  deriveCleanerJobUiState,
  isCleanerAssignmentAccepted,
  mobilePhaseDisplayForDashboard,
} from "@/lib/cleaner/cleanerMobileBookingMap";
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

/** Wall clock frozen before 2026-04-30 09:00 JHB + grace — offers remain open in tests. */
const nowBeforeOfferExpiry = Date.parse("2026-04-30T07:15:00.000Z");

/** Past scheduled start + 30m grace — unaccepted assigned offers expire. */
const nowAfterOfferExpiry = Date.parse("2026-04-30T08:15:00.000Z");

describe("isCleanerAssignmentAccepted", () => {
  it("is true when response is accepted or accepted_at is set", () => {
    expect(isCleanerAssignmentAccepted(baseRow({ cleaner_response_status: "accepted" }))).toBe(true);
    expect(isCleanerAssignmentAccepted(baseRow({ cleaner_response_status: "pending", accepted_at: "2026-04-30T07:00:00.000Z" }))).toBe(
      true,
    );
    expect(isCleanerAssignmentAccepted(baseRow({ cleaner_response_status: "pending" }))).toBe(false);
  });
});

describe("deriveCleanerJobUiState", () => {
  it("matches lifecycle slot semantics for assigned / accept / travel / start", () => {
    expect(deriveCleanerJobUiState(baseRow({ cleaner_response_status: "pending" }), { nowMs: nowBeforeOfferExpiry })).toEqual({
      phase: "accept",
      canReject: true,
    });
    expect(deriveCleanerJobUiState(baseRow({ cleaner_response_status: "pending" }), { nowMs: nowAfterOfferExpiry })).toEqual({
      phase: "expired",
    });
    expect(deriveCleanerJobUiState(baseRow({ cleaner_response_status: "accepted" }), { nowMs: nowAfterOfferExpiry })).toEqual({
      phase: "on_my_way",
    });
    expect(
      deriveCleanerJobUiState(
        baseRow({
          cleaner_response_status: "pending",
          accepted_at: "2026-04-30T07:00:00.000Z",
        }),
        { nowMs: nowAfterOfferExpiry },
      ),
    ).toEqual({ phase: "on_my_way" });
    expect(deriveCleanerJobUiState(baseRow({ cleaner_response_status: "on_my_way" }), { nowMs: nowBeforeOfferExpiry })).toEqual({
      phase: "start",
    });
  });

  it("maps 1:1 to deriveCleanerJobLifecycleSlot for regression coverage", () => {
    const rows = [
      baseRow({ cleaner_response_status: null }),
      baseRow({ cleaner_response_status: "pending" }),
      baseRow({ cleaner_response_status: "accepted" }),
      baseRow({ cleaner_response_status: "on_my_way" }),
      baseRow({ cleaner_response_status: "accepted", en_route_at: "2026-04-30T08:00:00.000Z" }),
    ];
    for (const r of rows) {
      for (const nowMs of [nowBeforeOfferExpiry, nowAfterOfferExpiry]) {
        const ui = deriveCleanerJobUiState(r, { nowMs });
        const slot = deriveCleanerJobLifecycleSlot(r, { nowMs });
        if (ui.phase === "none") expect(slot).toBeNull();
        else if (ui.phase === "expired") expect(slot).toEqual({ kind: "offer_expired" });
        else if (ui.phase === "accept") expect(slot).toEqual({ kind: "accept_reject", canReject: ui.canReject });
        else if (ui.phase === "on_my_way") expect(slot).toEqual({ kind: "en_route" });
        else if (ui.phase === "start") expect(slot).toEqual({ kind: "start" });
        else if (ui.phase === "complete") expect(slot).toEqual({ kind: "complete" });
      }
    }
  });
});

describe("confirmed status (legacy)", () => {
  it("uses same lifecycle as assigned for accept / en route", () => {
    expect(deriveCleanerJobUiState(baseRow({ status: "confirmed", cleaner_response_status: "pending" }), { nowMs: nowBeforeOfferExpiry })).toEqual({
      phase: "accept",
      canReject: true,
    });
    expect(
      deriveCleanerJobUiState(
        baseRow({ status: "confirmed", cleaner_response_status: "on_my_way" }),
        { nowMs: nowBeforeOfferExpiry },
      ),
    ).toEqual({ phase: "start" });
    expect(mobilePhaseDisplayForDashboard(baseRow({ status: "confirmed", cleaner_response_status: "pending" }), { nowMs: nowBeforeOfferExpiry })).toBe(
      "Needs accept",
    );
    expect(
      mobilePhaseDisplayForDashboard(
        baseRow({ status: "confirmed", cleaner_response_status: "on_my_way" }),
        { nowMs: nowBeforeOfferExpiry },
      ),
    ).toBe("En route");
  });
});

describe("deriveCleanerJobLifecycleSlot", () => {
  it("treats blank cleaner_response_status as not accepted (solo assigned)", () => {
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: null }), { nowMs: nowBeforeOfferExpiry })).toEqual({
      kind: "accept_reject",
      canReject: true,
    });
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "" }), { nowMs: nowBeforeOfferExpiry })).toEqual({
      kind: "accept_reject",
      canReject: true,
    });
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "none" }), { nowMs: nowBeforeOfferExpiry })).toEqual({
      kind: "accept_reject",
      canReject: true,
    });
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "pending" }), { nowMs: nowBeforeOfferExpiry })).toEqual({
      kind: "accept_reject",
      canReject: true,
    });
  });

  it("returns offer_expired when start + grace passed without accept", () => {
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "pending" }), { nowMs: nowAfterOfferExpiry })).toEqual({
      kind: "offer_expired",
    });
  });

  it("after accept without travel shows en_route", () => {
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "accepted" }), { nowMs: nowAfterOfferExpiry })).toEqual({
      kind: "en_route",
    });
  });

  it("after on_my_way or en_route_at shows start", () => {
    expect(deriveCleanerJobLifecycleSlot(baseRow({ cleaner_response_status: "on_my_way" }), { nowMs: nowBeforeOfferExpiry })).toEqual({
      kind: "start",
    });
    expect(
      deriveCleanerJobLifecycleSlot(
        baseRow({ cleaner_response_status: "accepted", en_route_at: "2026-04-30T08:00:00.000Z" }),
        { nowMs: nowBeforeOfferExpiry },
      ),
    ).toEqual({ kind: "start" });
  });
});
