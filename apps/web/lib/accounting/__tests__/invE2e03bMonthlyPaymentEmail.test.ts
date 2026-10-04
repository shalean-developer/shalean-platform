import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function read(relative: string) {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

describe("INV-E2E-03B monthly invoice payment contact lookup", () => {
  const source = read("lib/accounting/processAccountingSyncQueue.ts");

  it("queries only columns that exist on user_profiles", () => {
    expect(source).toContain('.select("billing_email, full_name")');
    expect(source).not.toContain('.select("billing_email, full_name, email")');
  });

  it("uses billing_email as the monthly invoice payment email", () => {
    expect(source).toContain("customerEmail = profile?.billing_email ?? undefined;");
    expect(source).not.toContain("profile?.email");
  });
});
