import { afterEach, describe, expect, it, vi } from "vitest";
import { adminNotificationRecipientSetting, getAdminNotificationRecipients } from "@/lib/email/adminNotificationRecipients";

afterEach(() => vi.unstubAllEnvs());

describe("owner-approved office notification inbox", () => {
  it("uses the approved inbox only on the explicit production deployment", () => {
    expect(adminNotificationRecipientSetting({ SHALEAN_APP_ENV: "production" })).toBe("info@shalean.co.za");
    expect(adminNotificationRecipientSetting({ SHALEAN_APP_ENV: "staging", NODE_ENV: "production" })).toBe("");
    expect(adminNotificationRecipientSetting({ NODE_ENV: "production" })).toBe("");
    expect(adminNotificationRecipientSetting({ SHALEAN_APP_ENV: "development" })).toBe("");
  });
  it("preserves an explicitly configured office inbox", () => {
    expect(adminNotificationRecipientSetting({ SHALEAN_APP_ENV: "production", ADMIN_NOTIFICATION_EMAIL: " ops@example.com " }))
      .toBe("ops@example.com");
  });
  it("deduplicates configured recipients and rejects partial invalid lists", () => {
    vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "ops@example.com,ops@example.com");
    expect(getAdminNotificationRecipients()).toEqual(["ops@example.com"]);
    vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "ops@example.com,invalid");
    expect(() => getAdminNotificationRecipients()).toThrow("valid email");
  });
});
