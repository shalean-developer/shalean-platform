import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = process.cwd();

/** This test file only — contains the forbidden substring in assertions. */
const ALLOWLIST_REL_SUFFIXES = ["lib/booking/forbidCleanersAvailableFetch.test.ts"];

function walkTsFiles(dir: string, out: string[]): void {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      walkTsFiles(p, out);
    } else if (/\.(tsx|ts)$/.test(ent.name)) {
      out.push(p);
    }
  }
}

describe("forbid /api/cleaners/available in booking funnel", () => {
  it("no client or scheduling code fetches the marketing roster endpoint", () => {
    const files: string[] = [];
    walkTsFiles(WEB_ROOT, files);

    const literalNeedles = [
      'fetch("/api/cleaners/available"',
      "fetch('/api/cleaners/available'",
      "fetch(`/api/cleaners/available",
    ];

    const offenders: string[] = [];
    for (const abs of files) {
      const rel = relative(WEB_ROOT, abs).replace(/\\/g, "/");
      if (ALLOWLIST_REL_SUFFIXES.some((s) => rel.replace(/^\.\//, "").endsWith(s))) continue;

      const text = readFileSync(abs, "utf8");
      for (const n of literalNeedles) {
        if (text.includes(n)) offenders.push(`${rel}: contains ${JSON.stringify(n)}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
