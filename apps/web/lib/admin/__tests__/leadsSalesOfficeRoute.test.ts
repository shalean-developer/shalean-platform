import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Leads & sales Office route", () => {
  it("exposes a stable canonical page", () => {
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/leads-sales/page.tsx"),
      "utf8",
    );
    expect(page).toContain('export { default } from "../sales-documents/page"');
  });

  it("adds Leads & sales to Office navigation and RBAC", () => {
    const nav = readFileSync(
      join(root, "src/features/office/OfficeNav.tsx"),
      "utf8",
    );
    const policy = readFileSync(
      join(root, "lib/admin/officeExperience.ts"),
      "utf8",
    );

    expect(nav).toContain('label: "Leads & sales"');
    expect(nav).toContain('href: "/office/leads-sales"');
    expect(policy).toContain('path: "/office/leads-sales"');
    expect(policy).toContain('"invoice.manage"');
  });

  it("redirects only the old root route to the canonical page", () => {
    const config = readFileSync(join(root, "next.config.ts"), "utf8");

    expect(config).toContain('source: "/office/sales-documents"');
    expect(config).toContain('destination: "/office/leads-sales"');
    expect(config).not.toContain('source: "/office/sales-documents/:path*"');
  });
});
