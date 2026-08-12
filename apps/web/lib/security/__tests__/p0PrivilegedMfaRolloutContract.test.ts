import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const loginForm = fs.readFileSync(
  path.resolve(process.cwd(), "app/auth/login/LoginForm.tsx"),
  "utf8",
);
const mfaForm = fs.readFileSync(
  path.resolve(process.cwd(), "app/auth/mfa/MfaForm.tsx"),
  "utf8",
);
const authClient = fs.readFileSync(
  path.resolve(process.cwd(), "lib/auth/authClient.ts"),
  "utf8",
);
const postAuthResolver = fs.readFileSync(
  path.resolve(process.cwd(), "lib/auth/resolvePostAuthDestination.ts"),
  "utf8",
);

describe("P0-04 privileged MFA flow contract", () => {
  it("routes only authoritatively resolved admin Office logins into MFA", () => {
    expect(loginForm).toContain('result.role === "admin"');
    expect(loginForm).toContain('result.path.startsWith("/office")');
    expect(loginForm).toContain('/auth/mfa?redirect=');
    expect(loginForm).not.toContain("readCachedUserRole");
    expect(postAuthResolver).toContain("role: json.role");
  });

  it("uses Supabase TOTP enrollment and challenge verification APIs", () => {
    expect(authClient).toContain('factorType: "totp"');
    expect(authClient).toContain("getAuthenticatorAssuranceLevel()");
    expect(authClient).toContain("listFactors()");
    expect(authClient).toContain("challengeAndVerify");
  });

  it("has no temporary bypass once mandatory AAL2 enforcement is enabled", () => {
    expect(mfaForm).not.toContain("Set up later — continue to Office");
    expect(mfaForm).not.toContain("continueForNow");
    expect(mfaForm).toContain("Multi-factor authentication required");
  });
});
