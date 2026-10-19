import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CleanerJobPrimaryActionButton } from "@/components/cleaner/CleanerJobPrimaryActionButton";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { augmentCleanerBookingWire } from "@/lib/cleaner/cleanerJobWireAugment";
import { acceptanceOverdueMessage } from "@shalean/utils";

afterEach(() => vi.useRealTimers());

describe("recurring acceptance warning", () => {
  const booking = {
    id: "recurring-warning-fixture", date: "2026-10-19", time: "09:00", status: "assigned",
    is_recurring_generated: true, cleaner_response_status: "pending", accepted_at: null,
  } as CleanerBookingRow;

  it("renders the warning next to an enabled acceptance action after the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T08:45:00Z"));
    const html = renderToStaticMarkup(createElement(CleanerJobPrimaryActionButton, { bookingId: booking.id, row: booking }));
    expect(html).toContain("Acceptance overdue.");
    expect(html).toContain("still assigned to you");
    expect(html).toContain("Accept job");
    expect(html).not.toMatch(/<button\b[^>]*\sdisabled(?:=|\s|>)/);
  });

  it("removes the warning once acceptance is persisted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T08:45:00Z"));
    const html = renderToStaticMarkup(createElement(CleanerJobPrimaryActionButton, {
      bookingId: booking.id, row: { ...booking, cleaner_response_status: "accepted", accepted_at: "2026-10-19T08:40:00Z" },
    }));
    expect(html).not.toContain("Acceptance overdue.");
    expect(html).toContain("On my way");
  });

  it("carries the same warning from the jobs API projection to the native notice", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T08:45:00Z"));
    const wire = { ...booking, ...augmentCleanerBookingWire(booking) };
    expect(wire.acceptance_overdue_message).toContain("Acceptance overdue.");
    expect(acceptanceOverdueMessage(wire)).toContain("Acceptance overdue.");
    expect(acceptanceOverdueMessage({ ...wire, accepted_at: "2026-10-19T08:40:00Z", cleaner_response_status: "accepted" })).toBeNull();
    expect(acceptanceOverdueMessage({ ...wire, status: "cancelled" })).toBeNull();
  });
});
