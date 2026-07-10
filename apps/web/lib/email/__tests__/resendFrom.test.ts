import { afterEach, describe, expect, it } from "vitest";

import {
  describeResendApiKeyMisconfig,
  getDefaultFromAddress,
  resolveResendApiKey,
  rewriteNoReplyFromAddress,
} from "@/lib/email/resendFrom";

describe("resolveResendApiKey", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("accepts a valid re_ key and strips quotes", () => {
    process.env.RESEND_API_KEY = '"re_test_key_123"';
    expect(resolveResendApiKey()).toBe("re_test_key_123");
  });

  it("rejects non-Resend keys such as Google API keys", () => {
    process.env.RESEND_API_KEY = "AIzaSyDb1i_example_google_key";
    expect(resolveResendApiKey()).toBeNull();
    expect(describeResendApiKeyMisconfig()).toMatch(/invalid/i);
  });

  it("falls back from empty RESEND_API_KEY to RESEND_KEY", () => {
    process.env.RESEND_API_KEY = "";
    process.env.RESEND_KEY = "re_backup_key";
    expect(resolveResendApiKey()).toBe("re_backup_key");
  });
});

describe("rewriteNoReplyFromAddress", () => {
  it("rewrites noreply and no-reply local parts to hello@", () => {
    expect(rewriteNoReplyFromAddress("Shalean Cleaning Services <noreply@shalean.co.za>")).toBe(
      "Shalean Cleaning Services <hello@shalean.co.za>",
    );
    expect(rewriteNoReplyFromAddress("Shalean <no-reply@shalean.co.za>")).toBe(
      "Shalean <hello@shalean.co.za>",
    );
    expect(rewriteNoReplyFromAddress("noreply@shalean.co.za")).toBe("hello@shalean.co.za");
  });

  it("leaves monitored addresses unchanged", () => {
    expect(rewriteNoReplyFromAddress("Shalean Cleaning Services <hello@shalean.co.za>")).toBe(
      "Shalean Cleaning Services <hello@shalean.co.za>",
    );
  });
});

describe("getDefaultFromAddress", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("composes legacy RESEND_FROM_EMAIL + RESEND_FROM_NAME", () => {
    delete process.env.RESEND_FROM;
    process.env.RESEND_FROM_EMAIL = "hello@shalean.co.za";
    process.env.RESEND_FROM_NAME = "Shalean Cleaning";
    expect(getDefaultFromAddress()).toBe("Shalean Cleaning <hello@shalean.co.za>");
  });

  it("rewrites noreply RESEND_FROM to hello@", () => {
    process.env.RESEND_FROM = "Shalean Cleaning Services <noreply@shalean.co.za>";
    expect(getDefaultFromAddress()).toBe("Shalean Cleaning Services <hello@shalean.co.za>");
  });
});
