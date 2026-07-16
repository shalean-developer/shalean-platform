import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Princess PR E admin notification retry safety", () => {
  const path = join(process.cwd(), "lib/notifications/notificationRetry.ts");
  const src = readFileSync(path, "utf8");

  it("routes email retries through safeResendSend (allowlist)", () => {
    expect(src).toContain("safeResendSend");
    expect(src).not.toMatch(/resend\.emails\.send\s*\(/);
  });

  it("supports Expo push retry path", () => {
    expect(src).toContain('channel === "push"');
    expect(src).toContain("dispatchExpoPush");
  });

  it("keeps customer WhatsApp retry blocked", () => {
    expect(src).toContain("Customer WhatsApp retry is disabled");
  });
});

describe("Princess PR E cleaner devices registration path", () => {
  it("exists as authenticated cleaner route", () => {
    const routePath = join(process.cwd(), "app/api/cleaner/devices/route.ts");
    const src = readFileSync(routePath, "utf8");
    expect(src).toContain("resolveCleanerFromRequest");
    expect(src).toContain('app: "cleaner"');
    expect(src).toContain("upsertUserPushToken");
    expect(src).toContain("deleteUserPushToken");
    expect(src).toContain("authUserId");
  });
});
