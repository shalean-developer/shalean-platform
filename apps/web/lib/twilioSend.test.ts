import { describe, it, expect } from "vitest";
import { describeTwilioSendError } from "@/lib/twilioSend";

describe("describeTwilioSendError", () => {
  it("decorates a Twilio 401 'Authenticate' rejection with auth hint", () => {
    const decorated = describeTwilioSendError({
      status: 401,
      code: 20003,
      message: "Authenticate",
    });
    expect(decorated).toContain("twilio_auth_failed");
    expect(decorated).toContain("status=401");
    expect(decorated).toContain("code=20003");
    expect(decorated).toContain("Authenticate");
    expect(decorated).toMatch(/TWILIO_ACCOUNT_SID/);
    expect(decorated).toMatch(/TWILIO_AUTH_TOKEN/);
  });

  it("flags auth-shaped messages even without HTTP status", () => {
    const decorated = describeTwilioSendError({ message: "Invalid Account SID" });
    expect(decorated).toContain("twilio_auth_failed");
    expect(decorated).toMatch(/TWILIO_ACCOUNT_SID/);
  });

  it("labels other 4xx/5xx errors with status/code prefix", () => {
    const decorated = describeTwilioSendError({
      status: 429,
      code: 20429,
      message: "Too Many Requests",
    });
    expect(decorated).toContain("twilio_http_error");
    expect(decorated).toContain("status=429");
    expect(decorated).toContain("code=20429");
    expect(decorated).toContain("Too Many Requests");
  });

  it("falls back to plain message for non-HTTP errors", () => {
    const decorated = describeTwilioSendError(new Error("Network unreachable"));
    expect(decorated).toBe("Network unreachable");
  });

  it("never returns longer than 500 chars", () => {
    const long = "x".repeat(2000);
    const decorated = describeTwilioSendError({ status: 401, code: 20003, message: long });
    expect(decorated.length).toBeLessThanOrEqual(500);
  });
});
