import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Princess PR E notification operator authz", () => {
  it("admin retry requires requireAdminApi", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/notifications/retry/route.ts"), "utf8");
    expect(src).toContain("requireAdminApi");
  });

  it("admin notification logs require requireAdminApi", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/notification-logs/route.ts"), "utf8");
    expect(src).toContain("requireAdminApi");
  });

  it("customer devices route does not expose admin log retry", () => {
    const src = readFileSync(join(process.cwd(), "app/api/customer/devices/route.ts"), "utf8");
    expect(src).not.toContain("notification_logs");
    expect(src).not.toContain("retryNotificationFromLog");
  });

  it("cleaner devices route does not expose admin log retry", () => {
    const src = readFileSync(join(process.cwd(), "app/api/cleaner/devices/route.ts"), "utf8");
    expect(src).not.toContain("notification_logs");
    expect(src).not.toContain("retryNotificationFromLog");
  });
});
