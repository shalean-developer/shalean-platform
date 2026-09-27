import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("review completion-path convergence", () => {
  it("completion notification ensures a review follow-up before notification dedupe", () => {
    const src = read("lib/notifications/notifyBookingEvent.ts");
    const ensureAt = src.indexOf("ensureReviewFollowUpForCompletedBooking(supabase, row)");
    const dedupeAt = src.indexOf('tryClaimNotificationDedupe(supabase, "completed_sent"');
    expect(ensureAt).toBeGreaterThan(-1);
    expect(dedupeAt).toBeGreaterThan(ensureAt);
  });

  it("admin status completion converges into review follow-up", () => {
    const src = read("lib/admin/performAdminBookingStatusChange.ts");
    expect(src).toContain("ensureReviewFollowUpForCompletedBooking");
    expect(src).toContain('intrStatus === "completed"');
  });

  it("admin monthly completed creation converges into review follow-up", () => {
    const src = read("app/api/admin/bookings/route.ts");
    expect(src).toContain("ensureReviewFollowUpForCompletedBooking");
    expect(src).toContain("if (adminMarkCompleted)");
  });

  it("booking lifecycle cron retains bounded recent-completion self-heal", () => {
    const src = read("app/api/cron/booking-lifecycle/route.ts");
    expect(src).toContain("repairRecentMissingReviewFollowUps");
    expect(src).toContain("lookbackHours: 24");
    expect(src).toContain("limit: 20");
  });
});
