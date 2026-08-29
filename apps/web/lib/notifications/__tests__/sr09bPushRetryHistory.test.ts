import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function source(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("SR-09B push retry history", () => {
  it("preserves the stored Expo attempt count when retrying a notification log row", () => {
    const src = source("lib/notifications/notificationRetry.ts");

    expect(src).toContain("const priorAttempts = Number(payload.attempts)");
    expect(src).toContain(
      "priorAttempts: Number.isFinite(priorAttempts) && priorAttempts > 0 ? Math.floor(priorAttempts) : 0",
    );
    expect(src).not.toContain("priorAttempts: Number.isFinite(priorAttempts) && priorAttempts > 0 ? 0 : 0");
  });
});
