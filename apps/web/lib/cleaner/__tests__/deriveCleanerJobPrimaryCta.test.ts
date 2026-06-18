import { describe, expect, it } from "vitest";
import { deriveCleanerJobPrimaryCta } from "@/lib/cleaner/deriveCleanerJobPrimaryCta";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";

function baseRow(over: Partial<CleanerBookingRow>): CleanerBookingRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    service: "Standard",
    date: "2026-04-30",
    time: "09:00",
    location: "Sea Point, Cape Town",
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

/** 2026-04-30 morning JHB — booking day for date 2026-04-30 */
const bookingDayMs = Date.parse("2026-04-30T07:15:00.000Z");
/** Day before booking */
const dayBeforeMs = Date.parse("2026-04-29T10:00:00.000Z");

describe("deriveCleanerJobPrimaryCta", () => {
  it("shows Accept job when phase is accept", () => {
    expect(
      deriveCleanerJobPrimaryCta({
        row: baseRow({ cleaner_response_status: "pending" }),
        nowMs: bookingDayMs,
      }),
    ).toEqual({ kind: "lifecycle", label: "Accept job", action: "accept" });
  });

  it("shows Navigate for accepted job before booking day", () => {
    const cta = deriveCleanerJobPrimaryCta({
      row: baseRow({ cleaner_response_status: "accepted" }),
      nowMs: dayBeforeMs,
      mapsQuery: "Sea Point",
    });
    expect(cta.kind).toBe("maps");
    if (cta.kind === "maps") {
      expect(cta.label).toBe("Navigate");
      expect(cta.href).toContain("Sea");
    }
  });

  it("hides Navigate when accepted future job has no maps query", () => {
    expect(
      deriveCleanerJobPrimaryCta({
        row: baseRow({ cleaner_response_status: "accepted", location: "" }),
        nowMs: dayBeforeMs,
        mapsQuery: null,
      }),
    ).toEqual({ kind: "hidden" });
  });

  it("shows On my way with en_route on booking day when accepted", () => {
    expect(
      deriveCleanerJobPrimaryCta({
        row: baseRow({ cleaner_response_status: "accepted" }),
        nowMs: bookingDayMs,
        mapsQuery: "Sea Point",
      }),
    ).toEqual({
      kind: "lifecycle",
      label: "On my way",
      action: "en_route",
      mapsHref: expect.stringContaining("Sea"),
    });
  });

  it("shows In progress when en route", () => {
    expect(
      deriveCleanerJobPrimaryCta({
        row: baseRow({ cleaner_response_status: "on_my_way", en_route_at: "2026-04-30T07:00:00.000Z" }),
        nowMs: bookingDayMs,
      }),
    ).toEqual({ kind: "lifecycle", label: "In progress", action: "start" });
  });

  it("shows Complete job with confirm when in progress", () => {
    expect(
      deriveCleanerJobPrimaryCta({
        row: baseRow({ status: "in_progress", started_at: "2026-04-30T08:00:00.000Z" }),
        nowMs: bookingDayMs,
      }),
    ).toEqual({
      kind: "lifecycle",
      label: "Complete job",
      action: "complete",
      requiresConfirm: true,
    });
  });

  it("hides for completed jobs", () => {
    expect(
      deriveCleanerJobPrimaryCta({
        row: baseRow({ status: "completed", completed_at: "2026-04-30T10:00:00.000Z" }),
        nowMs: bookingDayMs,
      }),
    ).toEqual({ kind: "hidden" });
  });
});
