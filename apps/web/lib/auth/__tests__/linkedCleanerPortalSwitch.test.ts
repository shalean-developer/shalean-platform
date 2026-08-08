import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(process.cwd());

function read(relativePath: string) {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("linked cleaner portal switching", () => {
  it("lets the jobs shell opt into linked-cleaner access without changing the required cleaner role", () => {
    const source = read("src/features/jobs/JobsShell.tsx");

    expect(source).toContain('requiredRole: "cleaner"');
    expect(source).toContain("allowLinkedCleaner: true");
  });

  it("requires a positive /api/cleaner/me link before bypassing a primary-role mismatch", () => {
    const source = read("lib/auth/useRoleRouteGuard.tsx");

    expect(source).toContain('fetch("/api/cleaner/me"');
    expect(source).toContain("if (!response.ok) return false");
    expect(source).toContain("Boolean(payload.cleaner?.id)");
    expect(source).toContain('requiredRole === "cleaner" && allowLinkedCleaner && linkedCleaner');
  });

  it("keeps the same-session supervisor return switch visible inside the cleaner jobs layout", () => {
    const source = read("app/(ui-redesign)/jobs/layout.tsx");

    expect(source).toContain('<SupervisorModeSwitcher activeMode="cleaner" />');
  });
});
