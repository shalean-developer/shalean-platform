import { describe, expect, it } from "vitest";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { trustJobCompletionFeedbackFromRow } from "@/lib/cleaner/trustJobCompletionFeedback";

function row(partial: Partial<CleanerBookingRow>): CleanerBookingRow {
  return {
    id: "b1",
    service: "Standard",
    date: "2026-01-01",
    time: "10:00",
    location: "Somewhere",
    status: "completed",
    total_paid_zar: null,
    customer_name: "A",
    customer_phone: "",
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: "2026-01-01T12:00:00Z",
    created_at: null,
    ...partial,
  };
}

describe("trustJobCompletionFeedbackFromRow", () => {
  it("returns amount when frozen cents present on completed job", () => {
    const r = row({ payout_frozen_cents: 14_500, payout_status: "pending" });
    expect(trustJobCompletionFeedbackFromRow(r)).toEqual({ kind: "amount", cents: 14_500 });
  });

  it("returns processing when paid row is malformed", () => {
    const r = row({
      payout_status: "paid",
      payout_paid_at: null,
      payout_frozen_cents: 10_000,
    });
    expect(trustJobCompletionFeedbackFromRow(r)).toEqual({ kind: "processing" });
  });

  it("returns processing when not completed", () => {
    const r = row({ status: "in_progress", payout_frozen_cents: 5000 });
    expect(trustJobCompletionFeedbackFromRow(r)).toEqual({ kind: "processing" });
  });
});
