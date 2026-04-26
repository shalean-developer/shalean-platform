import { describe, expect, it } from "vitest";
import { buildCleanerAssignedNotifyHeadline } from "@/lib/notifications/bookingNotifyFormat";

describe("buildCleanerAssignedNotifyHeadline", () => {
  it("includes earn amount and default job label when no context", () => {
    expect(buildCleanerAssignedNotifyHeadline(450, false)).toBe("✅ Earn R450 — Job");
  });

  it("marks estimate for team placeholder", () => {
    expect(buildCleanerAssignedNotifyHeadline(250, true)).toBe("✅ ~R250 (est.) — Job");
  });

  it("falls back when pay unknown", () => {
    expect(buildCleanerAssignedNotifyHeadline(null, false)).toBe("✅ New job assigned to you");
  });

  it("embeds service and short area when provided", () => {
    expect(
      buildCleanerAssignedNotifyHeadline(450, false, {
        service: "Deep Cleaning",
        areaShort: "Claremont",
      }),
    ).toBe("✅ Earn R450 — Deep Cleaning in Claremont");
  });

  it("estimate includes service and area", () => {
    expect(
      buildCleanerAssignedNotifyHeadline(300, true, {
        service: "Move out",
        areaShort: "Sea Point, Cape Town",
      }),
    ).toBe("✅ ~R300 (est.) — Move out Sea Point, Cape Town");
  });
});
