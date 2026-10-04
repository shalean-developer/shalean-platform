import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const PROD_REF = "paqjwfulwywtsyyvdxrq";
const STAGING_REF = "jhubpsbwmjgydkzztxeu";
const RETIRED_PROD_REF = "tchayecuvzssixyxlvfu";
const RETIRED_STAGING_REF = "gbgnemlpyykyhpqqbgru";

function readRepositoryFile(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

describe("MASTER-00A release source truth", () => {
  it("pins canonical production and staging Supabase refs", () => {
    const source = readRepositoryFile("apps/web/lib/env/deploymentEnvironment.ts");
    expect(source).toContain(`production: "${PROD_REF}"`);
    expect(source).toContain(`staging: "${STAGING_REF}"`);
    expect(source).not.toContain(RETIRED_PROD_REF);
    expect(source).not.toContain(RETIRED_STAGING_REF);
  });

  it("keeps main as the automatic staging source and deploy/staging as its artifact branch", () => {
    const workflow = readRepositoryFile(".github/workflows/prebuilt-plesk-staging.yml");
    expect(workflow).toContain("- main");
    expect(workflow).toContain("refs/heads/deploy/staging");
    expect(workflow).toContain(STAGING_REF);
  });

  it("keeps production as the production build source and deploy/production as its artifact branch", () => {
    const workflow = readRepositoryFile(".github/workflows/prebuilt-plesk-production.yml");
    expect(workflow).toContain("- production");
    expect(workflow).toContain("refs/heads/deploy/production");
    expect(workflow).toContain(PROD_REF);
  });

  it.each([
    ".github/workflows/plesk-pricing-test.yml",
    ".github/workflows/plesk-prod-build-08.yml",
    ".github/workflows/plesk-prod-deploy.yml",
  ])("does not restore obsolete release workflow %s", (relativePath) => {
    expect(existsSync(path.join(repositoryRoot, relativePath))).toBe(false);
  });
});
