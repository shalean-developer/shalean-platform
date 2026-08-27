import { readdirSync } from "node:fs";
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

describe("Office page RBAC policy coverage", () => {
  it("keeps the Office root as the only intentional page-level policy exception", () => {
    expect(OFFICE_POLICY_EXEMPT_PATHS).toEqual(["/office"]);
    expect(isOfficePolicyExemptPath("/office")).toBe(true);
    expect(isOfficePolicyExemptPath("/office/unclassified-example")).toBe(false);
  });

  it("classifies every Office page with RBAC or an explicit exception", () => {
    const pages = officePagePaths();
    expect(pages.length).toBeGreaterThan(80);

    const unclassified = pages.filter(
      (path) => !policyForOfficePath(path) && !isOfficePolicyExemptPath(path),
    );

    expect(unclassified).toEqual([]);
  });

  it("covers the SR-05A gaps with explicit policies", () => {
    expect(policyForOfficePath("/office/customer-care")).toMatchObject({
      anyOf: ["customer.view", "customer.contact", "incident.manage"],
      audience: ["owner", "manager", "operations", "customer-care"],
    });
    expect(policyForOfficePath("/office/workforce/training")).toMatchObject({
      anyOf: ["cleaner.view", "cleaner.documents.view", "incident.manage"],
      audience: ["owner", "manager", "workforce"],
    });
  });
});
