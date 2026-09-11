import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(process.cwd(), "../..");
const RETIRED_DEVELOPMENT_REF = "mbvixuzfvzbooiurvxwz";

const activeEnvironmentFiles = [
  "apps/web/.env.example",
  "scripts/env/build-vercel-patch-expression.mjs",
  "scripts/env/patch-vercel-nonprod-supabase.mjs",
  "scripts/env/seed-nonprod.mjs",
  "scripts/env/seed-uat-booking-fixtures.mjs",
] as const;

function readRepositoryFile(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

describe("retired development Supabase tooling", () => {
  it.each(activeEnvironmentFiles)("does not retain the retired project ref in %s", (relativePath) => {
    expect(readRepositoryFile(relativePath)).not.toContain(RETIRED_DEVELOPMENT_REF);
  });

  it.each([
    "scripts/env/seed-nonprod.mjs",
    "scripts/env/seed-uat-booking-fixtures.mjs",
  ])("keeps remote seed tooling staging-only in %s", (relativePath) => {
    const source = readRepositoryFile(relativePath);
    expect(source).toContain('env !== "staging"');
    expect(source).not.toMatch(/--env development|staging\|development/);
  });

  it.each([
    "scripts/env/build-vercel-patch-expression.mjs",
    "scripts/env/patch-vercel-nonprod-supabase.mjs",
  ])("does not generate development-branch Vercel patches in %s", (relativePath) => {
    const source = readRepositoryFile(relativePath);
    expect(source).not.toContain("gitBranch: 'development'");
    expect(source).not.toContain('load("development")');
  });
});
