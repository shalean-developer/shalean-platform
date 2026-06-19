import { describe, expect, it } from "vitest";
import { buildOfficeLaunchCheckStatus } from "@/lib/admin/officeLaunchCheck";

describe("buildOfficeLaunchCheckStatus", () => {
  it("returns disabled hints when admin client is missing", async () => {
    const status = await buildOfficeLaunchCheckStatus(null, {
      fetchedAt: "2026-06-19T12:00:00.000Z",
    });
    expect(status.enabled).toBe(true);
    expect(status.configReady).toBe(false);
    expect(status.setupHints[0]).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(status.placeholderCount).toBe(0);
  });
});
