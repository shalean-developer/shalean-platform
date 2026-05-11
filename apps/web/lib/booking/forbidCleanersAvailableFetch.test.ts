import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = process.cwd();

/** This test file only — contains the forbidden substring in assertions. */
const ALLOWLIST_REL_SUFFIXES = ["lib/booking/forbidCleanersAvailableFetch.test.ts"];

function walkTsFiles(dir: string, out: string[]): void {
  // Force string-backed entries so `ent.name` is a string regardless of the
  // active @types/node default (newer versions return `Dirent<NonSharedBuffer>`
  // unless `encoding` is provided).
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" }) as Dirent[];
  } catch {
    return;
  }
  for (const ent of entries) {
    const name = String(ent.name);
    const p = join(dir, name);
    if (ent.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walkTsFiles(p, out);
    } else if (/\.(tsx|ts)$/.test(name)) {
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
