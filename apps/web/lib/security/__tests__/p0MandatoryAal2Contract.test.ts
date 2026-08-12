import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const permissionGate = fs.readFileSync(
  path.resolve(process.cwd(), "lib/admin/requirePermission.ts"),
  "utf8",
);
const sessionBoundary = fs.readFileSync(
  path.resolve(process.cwd(), "lib/supabase/supabaseMiddleware.ts"),
  "utf8",
);
const verificationHelper = fs.readFileSync(
  path.resolve(process.cwd(), "lib/auth/officeEmailVerification.ts"),
  "utf8",
);
const mfaForm = fs.readFileSync(
  path.resolve(process.cwd(), "app/auth/mfa/MfaForm.tsx"),
  "utf8",
);

describe("P0-04E mandatory privileged Office email verification contract", () => {
  it("requires a user-bound Office verification cookie before evaluating granular admin permissions", () => {
    const verificationIndex = permissionGate.indexOf("verifyOfficeVerificationToken");
    const rbacIndex = permissionGate.indexOf("admin_has_permission");
    expect(verificationIndex).toBeGreaterThan(-1);
    expect(rbacIndex).toBeGreaterThan(-1);
    expect(verificationIndex).toBeLessThan(rbacIndex);
    expect(permissionGate).toContain('code: "office_email_verification_required"');
  });

  it("verifies the Supabase bearer session before trusting the Office verification cookie", () => {
    const verifyUserIndex = permissionGate.indexOf("auth.getUser(token)");
    const officeVerificationIndex = permissionGate.indexOf("verifyOfficeVerificationToken");
    expect(verifyUserIndex).toBeGreaterThan(-1);
    expect(officeVerificationIndex).toBeGreaterThan(verifyUserIndex);
  });

  it("enforces the same Office verification boundary for privileged routes", () => {
    expect(sessionBoundary).toContain('pathname.startsWith("/api/admin/")');
    expect(sessionBoundary).toContain('pathname.startsWith("/api/dispatch/")');
    expect(sessionBoundary).toContain('pathname.startsWith("/api/oauth/google")');
    expect(sessionBoundary).toContain('pathname.startsWith("/api/oauth/x")');
    expect(sessionBoundary).toContain("OFFICE_VERIFICATION_COOKIE");
    expect(sessionBoundary).toContain("verifyOfficeVerificationToken");
    expect(sessionBoundary).toContain('code: "office_email_verification_required"');
  });

  it("keeps custom machine and cron bearer auth outside the human Office verification gate", () => {
    expect(sessionBoundary).toContain("Only verified Supabase user sessions are Office-email gated here");
    expect(sessionBoundary).toContain("if (!bearerError && bearerUser?.id");
  });

  it("forces authenticated Office browser sessions through the email-code screen", () => {
    expect(sessionBoundary).toContain("isOfficePortalPath(pathname)");
    expect(sessionBoundary).toContain("verifyOfficeVerificationToken");
    expect(sessionBoundary).toContain('redirectUrl.pathname = "/auth/mfa"');
  });

  it("uses signed, expiring, user-bound HttpOnly verification state", () => {
    expect(verificationHelper).toContain('export const OFFICE_VERIFICATION_COOKIE = "shalean_office_verified"');
    expect(verificationHelper).toContain("OFFICE_VERIFICATION_TTL_MS = 8 * 60 * 60 * 1000");
    expect(verificationHelper).toContain("payload.uid === expectedUserId");
    expect(verificationHelper).toContain("payload.exp > now");
    expect(verificationHelper).toContain("httpOnly: true");
    expect(verificationHelper).toContain('sameSite: "lax"');
  });

  it("removes QR/TOTP setup and temporary bypasses from the live Office verification screen", () => {
    expect(mfaForm).not.toContain("Set up later — continue to Office");
    expect(mfaForm).not.toContain("continueForNow");
    expect(mfaForm).not.toContain("QRCode");
    expect(mfaForm).not.toContain("otpauth://");
    expect(mfaForm).toContain("Email me a security code");
    expect(mfaForm).toContain("Verify and continue to Office");
  });
});
