import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("useCleanerMobileWorkspace lifecycle routing", () => {
  const source = readFileSync(join(process.cwd(), "hooks/useCleanerMobileWorkspace.ts"), "utf8");

  it("does not use the compatibility cleaner/respond endpoint for assigned jobs", () => {
    expect(source).not.toContain('"/api/cleaner/respond"');
  });

  it("uses the canonical cleaner jobs endpoint with a per-gesture idempotency key", () => {
    expect(source).toContain("/api/cleaner/jobs/");
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain("idempotency_key: idempotencyKey");
  });

  it("keeps dispatch offer responses on dedicated offer endpoints", () => {
    expect(source).toContain("/api/cleaner/offers/");
  });
});
