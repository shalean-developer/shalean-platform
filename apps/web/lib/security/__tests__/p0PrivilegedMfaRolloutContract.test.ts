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

describe("P0-04B privileged MFA rollout contract", () => {
  it("routes only admin Office logins into the MFA rollout", () => {
    expect(loginForm).toContain('readCachedUserRole() === "admin"');
    expect(loginForm).toContain('result.path.startsWith("/office")');
    expect(loginForm).toContain('/auth/mfa?redirect=');
  });

  it("uses Supabase TOTP enrollment and challenge verification APIs", () => {
    expect(authClient).toContain('factorType: "totp"');
    expect(authClient).toContain("getAuthenticatorAssuranceLevel()");
    expect(authClient).toContain("listFactors()");
    expect(authClient).toContain("challengeAndVerify");
  });

  it("keeps a temporary rollout bypass until central AAL2 enforcement lands", () => {
    expect(mfaForm).toContain("Set up later — continue to Office");
    expect(mfaForm).toContain("Mandatory enforcement will only be enabled");
  });
});
