import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
) as { ignoreCommand?: string };

describe("CR-10 Vercel build gate", () => {
  it("allows Vercel builds only for the main branch", () => {
    expect(config.ignoreCommand).toContain("VERCEL_GIT_COMMIT_REF === 'main'");
    expect(config.ignoreCommand).not.toContain("staging");
  });
});
