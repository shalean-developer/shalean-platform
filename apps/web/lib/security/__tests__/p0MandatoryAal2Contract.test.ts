import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const permissionGate = fs.readFileSync(
  path.resolve(process.cwd(), "lib/admin/requirePermission.ts"),
  "utf8",
);
const mfaForm = fs.readFileSync(
  path.resolve(process.cwd(), "app/auth/mfa/MfaForm.tsx"),
  "utf8",
);

describe("P0-04C mandatory privileged AAL2 contract", () => {
  it("requires aal2 before evaluating privileged admin permissions", () => {
    const aalIndex = permissionGate.indexOf('verifiedTokenAal(token) !== "aal2"');
    const rbacIndex = permissionGate.indexOf('admin_has_permission');
    expect(aalIndex).toBeGreaterThan(-1);
    expect(rbacIndex).toBeGreaterThan(-1);
    expect(aalIndex).toBeLessThan(rbacIndex);
    expect(permissionGate).toContain('code: "mfa_required"');
  });

  it("only reads AAL after Supabase has verified the bearer token", () => {
    const verifyIndex = permissionGate.indexOf('auth.getUser(token)');
    const aalIndex = permissionGate.indexOf('verifiedTokenAal(token) !== "aal2"');
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(aalIndex).toBeGreaterThan(verifyIndex);
  });

  it("removes the P0-04B bypass from the MFA screen", () => {
    expect(mfaForm).not.toContain("Set up later — continue to Office");
    expect(mfaForm).not.toContain("continueForNow");
    expect(mfaForm).toContain("Multi-factor authentication required");
    expect(mfaForm).toContain("You must complete MFA before privileged Office APIs will accept this session.");
  });
});
