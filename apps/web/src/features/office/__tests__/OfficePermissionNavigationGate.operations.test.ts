import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../OfficePermissionNavigationGate.tsx", import.meta.url),
  "utf8",
);

describe("Operations Office workspace routing", () => {
  it("does not bypass the role dashboard and My Work panel for Operations", () => {
    expect(source).not.toContain('if (role === "operations")');
    expect(source).toContain("<OfficeRoleDashboard permissions={permissions} profile={profile} />");
    expect(source).toContain("<OfficeMyWorkPanel />");
  });
});
