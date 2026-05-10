import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("booking-lifecycle cron completion notify (static guard)", () => {
  const routePath = join(process.cwd(), "app/api/cron/booking-lifecycle/route.ts");

  it("routes booking.completed through notificationRouter when BOOKING_COMPLETED_ROUTER_ENABLED is on", () => {
    const src = readFileSync(routePath, "utf8");
    expect(src).toContain("isBookingCompletedRouterEnabled");
    expect(src).toContain("routeBookingNotificationEvent");
    expect(src).toContain("buildBookingEvent");
    expect(src).toContain('"booking.completed"');
  });

  it("preserves direct notifyBookingEvent(completed) when router flag is off", () => {
    const src = readFileSync(routePath, "utf8");
    expect(src).toContain("notifyBookingEvent({ type: \"completed\"");
  });
});
