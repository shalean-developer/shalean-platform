import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("BEA-EMAIL-001 notify/resend recurring columns", () => {
  it("payment_confirmed select includes recurring_frequency and recurring_days", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/notifyBookingEvent.ts"), "utf8");
    const idx = src.indexOf('event.type === "payment_confirmed"');
    expect(idx).toBeGreaterThan(-1);
    const slice = src.slice(idx, idx + 2500);
    expect(slice).toContain("recurring_frequency");
    expect(slice).toContain("recurring_days");
    expect(slice).toContain("booking_type");
  });

  it("resend confirmation select includes recurring_frequency and recurring_days", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/resendBookingConfirmationEmails.ts"),
      "utf8",
    );
    expect(src).toContain("recurring_frequency");
    expect(src).toContain("recurring_days");
  });

  it("confirm persists recurringFrequency/recurringDays on booking_snapshot", () => {
    const src = readFileSync(join(process.cwd(), "app/api/booking-v2/confirm/route.ts"), "utf8");
    expect(src).toContain("recurringFrequency: data.recurringFrequency");
    expect(src).toContain("recurringDays: data.recurringDays");
  });
});
