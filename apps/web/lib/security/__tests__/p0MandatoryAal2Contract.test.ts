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
const mfaForm = fs.readFileSync(
  path.resolve(process.cwd(), "app/auth/mfa/MfaForm.tsx"),
  "utf8",
);

describe("P0-04C mandatory privileged AAL2 contract", () => {
  it("requires aal2 before evaluating granular admin permissions", () => {
    const aalIndex = permissionGate.indexOf('verifiedTokenAal(token) !== "aal2"');
    const rbacIndex = permissionGate.indexOf('admin_has_permission');
    expect(aalIndex).toBeGreaterThan(-1);
    expect(rbacIndex).toBeGreaterThan(-1);
    expect(aalIndex).toBeLessThan(rbacIndex);
    expect(permissionGate).toContain('code: "mfa_required"');
  });

  it("only reads bearer AAL after Supabase verifies the user token", () => {
    const verifyIndex = permissionGate.indexOf('auth.getUser(token)');
    const aalIndex = permissionGate.indexOf('verifiedTokenAal(token) !== "aal2"');
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(aalIndex).toBeGreaterThan(verifyIndex);
  });

  it("enforces AAL2 at the shared request boundary for legacy privileged routes", () => {
    expect(sessionBoundary).toContain('pathname.startsWith("/api/admin/")');
    expect(sessionBoundary).toContain('pathname.startsWith("/api/dispatch/")');
    expect(sessionBoundary).toContain('pathname.startsWith("/api/oauth/google")');
    expect(sessionBoundary).toContain('pathname.startsWith("/api/oauth/x")');
    expect(sessionBoundary).toContain('publicClient.auth.getUser(token)');
    expect(sessionBoundary).toContain('verifiedJwtAal(token) !== "aal2"');
    expect(sessionBoundary).toContain('cookieAal !== "aal2"');
    expect(sessionBoundary).toContain('code: "mfa_required"');
  });

  it("preserves route-specific machine auth while gating verified human sessions", () => {
    expect(sessionBoundary).toContain("Only Supabase user tokens are MFA-gated here");
    expect(sessionBoundary).toContain("if (!bearerError && bearerUser?.id");
  });

  it("forces authenticated Office browser sessions through MFA", () => {
    expect(sessionBoundary).toContain("isOfficePortalPath(pathname) && user && cookieAal !== \"aal2\"");
    expect(sessionBoundary).toContain('redirectUrl.pathname = "/auth/mfa"');
  });

  it("removes the P0-04B bypass from the MFA screen", () => {
    expect(mfaForm).not.toContain("Set up later — continue to Office");
    expect(mfaForm).not.toContain("continueForNow");
    expect(mfaForm).toContain("Multi-factor authentication required");
    expect(mfaForm).toContain("You must complete MFA before privileged Office APIs will accept this session.");
  });
});
