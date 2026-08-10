import { describe, expect, it } from "vitest";
import {
  cleanerJobIdFromPathname,
  shouldSendCleanerLiveLocation,
} from "@/components/cleaner/CleanerLiveLocationBridge";

describe("CleanerLiveLocationBridge gating", () => {
  it("extracts only cleaner job-detail booking ids", () => {
    expect(cleanerJobIdFromPathname("/cleaner/jobs/abc-123")).toBe("abc-123");
    expect(cleanerJobIdFromPathname("/cleaner/jobs/abc%20123/")).toBe("abc 123");
    expect(cleanerJobIdFromPathname("/cleaner/jobs")).toBeNull();
    expect(cleanerJobIdFromPathname("/cleaner/dashboard")).toBeNull();
  });

  it("enables GPS only for on_my_way", () => {
    expect(shouldSendCleanerLiveLocation("on_my_way")).toBe(true);
    expect(shouldSendCleanerLiveLocation(" ON_MY_WAY ")).toBe(true);
    expect(shouldSendCleanerLiveLocation("accepted")).toBe(false);
    expect(shouldSendCleanerLiveLocation("in_progress")).toBe(false);
    expect(shouldSendCleanerLiveLocation(null)).toBe(false);
  });
});
