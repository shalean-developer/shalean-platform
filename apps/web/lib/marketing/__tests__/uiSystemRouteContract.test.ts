import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const uiSystemDir = resolve(process.cwd(), "app/dev/ui-system");

function uiSystemSource(): string {
  return readdirSync(uiSystemDir)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => readFileSync(resolve(uiSystemDir, file), "utf8"))
    .join("\n");
}

describe("development UI-system route contract", () => {
  it("uses one page H1 and no nested main landmark", () => {
    const source = uiSystemSource();
    expect(source.match(/<h1\b/g) ?? []).toHaveLength(1);
    expect(source).not.toMatch(/<main\b/);
  });

  it("records current RD-PUBLIC implementation scope without stale gate language", () => {
    const source = uiSystemSource();
    for (const slice of ["RD-PUBLIC-01", "RD-PUBLIC-02", "RD-PUBLIC-03", "RD-PUBLIC-04"]) {
      expect(source).toContain(slice);
    }
    expect(source).not.toContain("RD-P00 not approved");
    expect(source).not.toContain("RD-P01 does not start");
  });
});
