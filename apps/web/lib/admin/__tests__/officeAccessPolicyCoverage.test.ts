import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OFFICE_POLICY_EXEMPT_PATHS,
  isOfficePolicyExemptPath,
  policyForOfficePath,
} from "@/lib/admin/officeExperience";

const OFFICE_APP_ROOT = fileURLToPath(new URL("../../../app/(ui-redesign)/office/", import.meta.url));

function officePagePaths(directory = OFFICE_APP_ROOT, segments: string[] = []): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") {
      const urlSegments = segments.filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
      paths.push(urlSegments.length === 0 ? "/office" : `/office/${urlSegments.join("/")}`);
      continue;
    }
    if (entry.isDirectory()) {
      paths.push(...officePagePaths(`${directory}/${entry.name}`, [...segments, entry.name]));
    }
  }
  return paths.sort();
}

describe("SR-05A Office page RBAC policy coverage", () => {
  it("keeps the Office root as the sole intentional page-level policy exception", () => {
    expect(OFFICE_POLICY_EXEMPT_PATHS).toEqual(["/office"]);
    expect(isOfficePolicyExemptPath("/office")).toBe(true);
    expect(isOfficePolicyExemptPath("/office/unclassified-example")).toBe(false);
    expect(policyForOfficePath("/office")).toBeNull();
  });

  it("covers the two approved SR-05A page-policy gaps", () => {
    expect(policyForOfficePath("/office/customer-care")).toMatchObject({
      anyOf: ["customer.view", "customer.contact", "incident.manage"],
      audience: ["owner", "manager", "operations", "customer-care"],
    });
    expect(policyForOfficePath("/office/workforce/training")).toMatchObject({
      anyOf: ["cleaner.view", "cleaner.documents.view", "incident.manage"],
      audience: ["owner", "manager", "workforce"],
    });
  });

  it("keeps real Office pages subject to policy or the sole root exception", () => {
    const pages = officePagePaths();
    expect(pages.length).toBeGreaterThan(80);
    expect(pages).toContain("/office/customer-care");
    expect(pages).toContain("/office/workforce/training");
    expect(pages.filter(isOfficePolicyExemptPath)).toEqual(["/office"]);
  });

  it("fails closed when an Office page has neither a policy nor the root exception", () => {
    expect(policyForOfficePath("/office/unclassified-example")).toBeNull();
    expect(isOfficePolicyExemptPath("/office/unclassified-example")).toBe(false);

    const boundary = readFileSync(
      fileURLToPath(new URL("../../../src/features/office/OfficePermissionBoundary.tsx", import.meta.url)),
      "utf8",
    );
    expect(boundary).toContain("isOfficePolicyExemptPath(pathname)");
    expect(boundary).toContain('{ status: "denied", permissions: [], unclassified: true }');
    expect(boundary).toContain("This Office page has no approved access policy and is blocked by default.");
    expect(boundary).not.toContain('if (!policy) {\n      setState({ status: "allowed" });');
  });
});
