import { describe, expect, it } from "vitest";
import { cleanerIssueBookingIdFromPathname } from "@/components/cleaner/CleanerIssueReportControl";

describe("CleanerIssueReportControl route gating", () => {
  it("shows only on cleaner job details", () => {
    expect(cleanerIssueBookingIdFromPathname("/cleaner/jobs/abc-123")).toBe("abc-123");
    expect(cleanerIssueBookingIdFromPathname("/cleaner/jobs/abc%20123/")).toBe("abc 123");
    expect(cleanerIssueBookingIdFromPathname("/cleaner/jobs")).toBeNull();
    expect(cleanerIssueBookingIdFromPathname("/cleaner/earnings")).toBeNull();
  });
});
