import { describe, expect, it } from "vitest";
import {
  ADMIN_DISPATCH_SERVICE_LABELS,
  ADMIN_DISPATCH_SERVICE_SLUGS,
} from "@/lib/cleaner/cleanerPreferencesTypes";

describe("cleaner preference service options", () => {
  it("exposes only active dispatch service slugs", () => {
    expect(ADMIN_DISPATCH_SERVICE_SLUGS).toEqual(["standard", "airbnb", "deep", "move", "carpet"]);
    expect(ADMIN_DISPATCH_SERVICE_SLUGS).not.toContain("quick");
    expect(Object.keys(ADMIN_DISPATCH_SERVICE_LABELS)).toEqual([...ADMIN_DISPATCH_SERVICE_SLUGS]);
  });
});
