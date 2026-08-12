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
const emailClient = fs.readFileSync(
  path.resolve(process.cwd(), "lib/auth/officeEmailClient.ts"),
  "utf8",
);
const verificationHelper = fs.readFileSync(
  path.resolve(process.cwd(), "lib/auth/officeEmailVerification.ts"),
  "utf8",
);
const requestRoute = fs.readFileSync(
  path.resolve(process.cwd(), "app/api/auth/office-email-verification/request/route.ts"),
  "utf8",
);
const verifyRoute = fs.readFileSync(
  path.resolve(process.cwd(), "app/api/auth/office-email-verification/verify/route.ts"),
  "utf8",
);
const postAuthResolver = fs.readFileSync(
  path.resolve(process.cwd(), "lib/auth/resolvePostAuthDestination.ts"),
  "utf8",
);

describe("P0-04E privileged Office email verification flow contract", () => {
  it("routes only authoritatively resolved admin Office logins into verification", () => {
    expect(loginForm).toContain('result.role === "admin"');
    expect(loginForm).toContain('result.path.startsWith("/office")');
    expect(loginForm).toContain('/auth/mfa?redirect=');
    expect(loginForm).not.toContain("readCachedUserRole");
    expect(postAuthResolver).toContain("role: json.role");
  });

  it("uses authenticated Shalean request and verify endpoints instead of Supabase TOTP", () => {
    expect(emailClient).toContain('/api/auth/office-email-verification/request');
    expect(emailClient).toContain('/api/auth/office-email-verification/verify');
    expect(emailClient).toContain("getSupabaseAccessToken()");
    expect(emailClient).not.toContain('factorType: "totp"');
    expect(emailClient).not.toContain("challengeAndVerify");
  });

  it("restricts code issuance to authenticated admin-role users and throttles resends", () => {
    expect(requestRoute).toContain("publicClient.auth.getUser(token)");
    expect(requestRoute).toContain('resolved.role !== "admin"');
    expect(requestRoute).toContain("OFFICE_CODE_RESEND_COOLDOWN_MS");
    expect(requestRoute).toContain("status: 429");
    expect(requestRoute).toContain('"Retry-After"');
    expect(requestRoute).toContain("hashOfficeEmailCode(user.id, challengeId, code)");
  });

  it("guards seed recipients before calling the email provider", () => {
    const guardIndex = requestRoute.indexOf('assertNotSeedEmail(user.email, "office-email-verification")');
    const sendIndex = requestRoute.indexOf("resend.emails.send");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(sendIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(sendIndex);
    expect(requestRoute).toContain("Security-code email is disabled for development seed accounts.");
  });

  it("keeps codes short-lived, one-time and attempt limited", () => {
    expect(verificationHelper).toContain("OFFICE_CODE_TTL_MS = 10 * 60 * 1000");
    expect(verificationHelper).toContain("OFFICE_CODE_RESEND_COOLDOWN_MS = 60 * 1000");
    expect(verificationHelper).toContain("OFFICE_CODE_MAX_ATTEMPTS = 5");
    expect(verifyRoute).toContain("attempts >= maxAttempts");
    expect(verifyRoute).toContain("nextAttempts >= maxAttempts");
    expect(verifyRoute).toContain("verifyOfficeEmailCodeHash");
  });

  it("serializes verification attempts before evaluating a code", () => {
    const claimIndex = verifyRoute.indexOf(".eq(\"attempt_count\", attempts)");
    const compareIndex = verifyRoute.indexOf("verifyOfficeEmailCodeHash(user.id", claimIndex);
    expect(claimIndex).toBeGreaterThan(-1);
    expect(compareIndex).toBeGreaterThan(claimIndex);
    expect(verifyRoute).toContain("if (!claimedAttempt)");
    expect(verifyRoute).toContain("Another verification attempt was processed. Try again.");
  });

  it("binds the verification cookie to the current Supabase sign-in session", () => {
    expect(verificationHelper).toContain("officeSessionBinding(lastSignInAt");
    expect(verificationHelper).toContain("payload.sid === expectedSessionBinding");
    expect(verifyRoute).toContain("officeSessionBinding(user.last_sign_in_at)");
    expect(verifyRoute).toContain("createOfficeVerificationToken(user.id, sessionBinding)");
  });

  it("issues the signed Office verification cookie only after successful code verification", () => {
    const verifyIndex = verifyRoute.indexOf("verifyOfficeEmailCodeHash(user.id");
    const cookieIndex = verifyRoute.indexOf("response.cookies.set", verifyIndex);
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(cookieIndex).toBeGreaterThan(verifyIndex);
    expect(verifyRoute).toContain("createOfficeVerificationToken(user.id, sessionBinding)");
    expect(verifyRoute).toContain("officeVerificationCookieOptions(secure)");
  });

  it("shows the simple email-code flow with no QR or authenticator setup", () => {
    expect(mfaForm).toContain("Email me a security code");
    expect(mfaForm).toContain("Enter the 6-digit security code from your email.");
    expect(mfaForm).toContain("Verify and continue to Office");
    expect(mfaForm).toContain("No authenticator app or second phone is needed.");
    expect(mfaForm).not.toContain("QRCode");
    expect(mfaForm).not.toContain("otpauth://");
    expect(mfaForm).not.toContain("Set up later — continue to Office");
  });
});
