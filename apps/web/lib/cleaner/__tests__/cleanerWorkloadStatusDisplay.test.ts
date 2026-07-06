import { describe, expect, it } from "vitest";
import {
  cleanerWorkloadStatusBadgeClass,
  cleanerWorkloadStatusLabel,
  replacementAvailabilityDisplayLabel,
} from "@/lib/cleaner/cleanerWorkloadStatusDisplay";

describe("cleanerWorkloadStatusDisplay", () => {
  it("maps stored busy to In progress", () => {
    expect(cleanerWorkloadStatusLabel("busy", true)).toBe("In progress");
    expect(cleanerWorkloadStatusLabel("BUSY")).toBe("In progress");
  });

  it("treats manual pause as Offline", () => {
    expect(cleanerWorkloadStatusLabel("available", false)).toBe("Offline");
    expect(cleanerWorkloadStatusLabel("busy", false)).toBe("Offline");
  });

  it("uses violet badge for in-progress workload", () => {
    expect(cleanerWorkloadStatusBadgeClass("busy", true)).toContain("violet");
  });

  it("maps replacement availability labels", () => {
    expect(replacementAvailabilityDisplayLabel("busy")).toBe("In progress");
    expect(replacementAvailabilityDisplayLabel("available")).toBe("Available");
    expect(replacementAvailabilityDisplayLabel("unavailable")).toBe("Unavailable");
  });
});
