import { describe, expect, it } from "vitest";
import {
  classifyPreferredDispatchContext,
  computePreferredOfferExpiresAt,
  PREFERRED_SKIP_MINUTES,
  preferredOfferTtlSeconds,
} from "@/lib/dispatch/preferredCleanerDispatchPolicy";

describe("classifyPreferredDispatchContext", () => {
  it("skips preferred wait when job starts within 2 hours", () => {
    const now = new Date("2026-06-17T10:00:00+02:00");
    expect(
      classifyPreferredDispatchContext({
        dateYmd: "2026-06-17",
        timeHm: "11:30",
        now,
      }),
    ).toBe("skip_within_2_hours");
  });

  it("treats same-day booking (>=2h out) as same_day_urgent", () => {
    const now = new Date("2026-06-17T08:00:00+02:00");
    expect(
      classifyPreferredDispatchContext({
        dateYmd: "2026-06-17",
        timeHm: "14:00",
        now,
      }),
    ).toBe("same_day_urgent");
  });

  it("treats admin high priority as same_day_urgent", () => {
    const now = new Date("2026-06-20T08:00:00+02:00");
    expect(
      classifyPreferredDispatchContext({
        dateYmd: "2026-06-25",
        timeHm: "09:00",
        bookingPriority: "high",
        now,
      }),
    ).toBe("same_day_urgent");
  });

  it("uses normal path for future non-urgent bookings", () => {
    const now = new Date("2026-06-17T08:00:00+02:00");
    expect(
      classifyPreferredDispatchContext({
        dateYmd: "2026-06-25",
        timeHm: "09:00",
        now,
      }),
    ).toBe("normal");
  });
});

describe("computePreferredOfferExpiresAt", () => {
  it("normal booking: deadline is 4 PM Johannesburg on offer day", () => {
    const sentAt = new Date("2026-06-17T09:00:00+02:00");
    const expires = computePreferredOfferExpiresAt({
      sentAt,
      dateYmd: "2026-06-25",
      timeHm: "10:00",
    });
    expect(expires.toISOString()).toBe(new Date("2026-06-17T16:00:00+02:00").toISOString());
  });

  it("normal booking sent after 4 PM gets 30 minutes", () => {
    const sentAt = new Date("2026-06-17T17:15:00+02:00");
    const expires = computePreferredOfferExpiresAt({
      sentAt,
      dateYmd: "2026-06-25",
      timeHm: "10:00",
    });
    expect(expires.getTime() - sentAt.getTime()).toBe(30 * 60_000);
  });

  it("same-day urgent with job starting in 2–3 hours uses 5 minute TTL", () => {
    const sentAt = new Date("2026-06-17T10:00:00+02:00");
    const expires = computePreferredOfferExpiresAt({
      sentAt,
      dateYmd: "2026-06-17",
      timeHm: "12:30",
    });
    expect(expires.getTime() - sentAt.getTime()).toBe(5 * 60_000);
  });

  it("same-day urgent with enough lead time uses 20 minute TTL", () => {
    const sentAt = new Date("2026-06-17T08:00:00+02:00");
    const expires = computePreferredOfferExpiresAt({
      sentAt,
      dateYmd: "2026-06-17",
      timeHm: "14:00",
    });
    expect(expires.getTime() - sentAt.getTime()).toBe(20 * 60_000);
  });
});

describe("preferredOfferTtlSeconds", () => {
  it("clamps to at least 60 seconds", () => {
    const sent = new Date("2026-06-17T10:00:00+02:00");
    const exp = new Date(sent.getTime() + 15_000);
    expect(preferredOfferTtlSeconds(sent, exp)).toBe(60);
  });
});

describe("PREFERRED_SKIP_MINUTES", () => {
  it("is 2 hours", () => {
    expect(PREFERRED_SKIP_MINUTES).toBe(120);
  });
});

describe("preferredDispatchStatusAdminLabel", () => {
  it("uses urgent-unavailable copy when preferred cleaner is skipped", async () => {
    const { preferredDispatchStatusAdminLabel, PREFERRED_CLEANER_UNAVAILABLE_URGENT_MESSAGE } = await import(
      "@/lib/dispatch/preferredCleanerDispatchPolicy"
    );
    expect(preferredDispatchStatusAdminLabel("preferred_cleaner_skipped_urgent")).toBe(
      PREFERRED_CLEANER_UNAVAILABLE_URGENT_MESSAGE,
    );
  });

  it("uses distinct copy for backup_offer_pending", async () => {
    const { preferredDispatchStatusAdminLabel } = await import("@/lib/dispatch/preferredCleanerDispatchPolicy");
    expect(preferredDispatchStatusAdminLabel("backup_dispatch_started")).toBe("Backup dispatch started");
    expect(preferredDispatchStatusAdminLabel("backup_offer_pending")).toBe("Backup offers pending");
  });
});

describe("customerPreferredDispatchNotice", () => {
  it("returns urgent-unavailable message for skipped preferred cleaner", async () => {
    const { customerPreferredDispatchNotice, PREFERRED_CLEANER_UNAVAILABLE_URGENT_MESSAGE } = await import(
      "@/lib/dispatch/preferredCleanerDispatchPolicy"
    );
    expect(customerPreferredDispatchNotice("preferred_cleaner_skipped_urgent")).toBe(
      PREFERRED_CLEANER_UNAVAILABLE_URGENT_MESSAGE,
    );
    expect(customerPreferredDispatchNotice("preferred_cleaner_pending")).toBeNull();
  });
});
