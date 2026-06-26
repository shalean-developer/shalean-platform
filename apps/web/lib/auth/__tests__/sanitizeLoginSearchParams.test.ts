import { describe, expect, it } from "vitest";

import { parseLoginSearchParams } from "@/lib/auth/sanitizeLoginSearchParams";

describe("parseLoginSearchParams", () => {
  it("flags password in query and builds safe redirect", () => {
    const parsed = parseLoginSearchParams({
      email: "admin@shalean.com",
      password: "Cf246185!",
      redirect: "/office",
    });
    expect(parsed.hasPasswordInQuery).toBe(true);
    expect(parsed.shouldStripCredentialsFromUrl).toBe(true);
    expect(parsed.emailPrefill).toBe("admin@shalean.com");
    expect(parsed.safeSearch).toBe("?redirect=%2Foffice");
  });

  it("keeps non-credential params only", () => {
    const parsed = parseLoginSearchParams({
      intent: "customer",
      redirect: "/account",
    });
    expect(parsed.hasPasswordInQuery).toBe(false);
    expect(parsed.shouldStripCredentialsFromUrl).toBe(false);
    expect(parsed.safeSearch).toBe("?intent=customer&redirect=%2Faccount");
  });

  it("strips email from url but returns prefill", () => {
    const parsed = parseLoginSearchParams({
      email: "user@example.com",
      redirect: "/account",
    });
    expect(parsed.hasPasswordInQuery).toBe(false);
    expect(parsed.shouldStripCredentialsFromUrl).toBe(true);
    expect(parsed.emailPrefill).toBe("user@example.com");
    expect(parsed.safeSearch).toBe("?redirect=%2Faccount");
  });
});
