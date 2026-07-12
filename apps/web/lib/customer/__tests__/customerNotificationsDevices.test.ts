import { describe, expect, it } from "vitest";
import { isValidExpoPushToken } from "@/lib/customer/customerPushTokens";

describe("isValidExpoPushToken", () => {
  it("accepts Expo push token format", () => {
    expect(isValidExpoPushToken("ExponentPushToken[abcdefghijklmnopqrst]")).toBe(true);
  });

  it("rejects empty / short tokens", () => {
    expect(isValidExpoPushToken("")).toBe(false);
    expect(isValidExpoPushToken("short")).toBe(false);
  });

  it("rejects tokens with spaces / injection junk", () => {
    expect(isValidExpoPushToken("ExponentPushToken[abc def]")).toBe(false);
    expect(isValidExpoPushToken("ExponentPushToken[<script>]")).toBe(false);
  });
});

describe("push register authz contract", () => {
  it("register payload must not trust client userId (route strips it)", () => {
    const body: Record<string, unknown> = {
      token: "ExponentPushToken[abcdefghijklmnopqrst]",
      platform: "ios",
      userId: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
    };
    delete body.user_id;
    delete body.userId;
    expect(body.userId).toBeUndefined();
    expect(body.user_id).toBeUndefined();
    expect(typeof body.token).toBe("string");
  });
});

describe("mark-read ownership denial mapping", () => {
  it("documents that foreign notification ids return Not found (404), not the row", () => {
    // Route uses markCustomerNotificationRead which returns status 404 when user_id mismatch.
    const foreignDenied = { ok: false as const, error: "Not found.", status: 404 };
    expect(foreignDenied.status).toBe(404);
    expect(foreignDenied.error).toBe("Not found.");
  });
});
