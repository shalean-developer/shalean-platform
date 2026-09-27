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

  it("booking lifecycle cron does not backfill historical review follow-ups", () => {
    const src = read("app/api/cron/booking-lifecycle/route.ts");
    expect(src).not.toContain("repairRecentMissingReviewFollowUps");
    expect(src).not.toContain("review_follow_up.repair");
  });

  it("cron auto-completions await the completion notification path", () => {
    const src = read("app/api/cron/booking-lifecycle/route.ts");
    expect(src).toContain("const nav = await routeBookingNotificationEvent");
    expect(src).toContain('await notifyBookingEvent({ type: "completed"');
    expect(src).not.toContain("void routeBookingNotificationEvent(event, { admin }).then");
  });

  it("new cleaner completions still create review follow-up going forward", () => {
    const src = read("lib/booking/bookingOperations.ts");
    expect(src).toContain("ensureReviewFollowUpForCompletedBooking");
    expect(src).toContain("export async function markBookingCompleted");
  });
});
