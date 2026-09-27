import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const termsSource = readFileSync(
  join(process.cwd(), "app/terms-of-service/page.tsx"),
  "utf8",
);

describe("SITE-E2E-11 satisfaction guarantee terms", () => {
  it("defines the satisfaction guarantee on the Terms page", () => {
    expect(termsSource).toContain("Satisfaction guarantee");
    expect(termsSource).toContain("confirmed cleaning scope");
    expect(termsSource).toContain("reasonable cleaning standard");
    expect(termsSource).toContain("corrective clean");
  });

  it("defines material exclusions", () => {
    expect(termsSource).toContain("pre-existing damage");
    expect(termsSource).toContain("permanent stains or deterioration");
    expect(termsSource).toContain("maintenance or repairs");
    expect(termsSource).toContain("specialist remediation");
    expect(termsSource).toContain("items excluded from the selected service");
  });

  it("does not promise an automatic refund", () => {
    expect(termsSource).toContain("is not automatic");
    expect(termsSource).not.toContain("full refund");
    expect(termsSource).not.toContain("automatic refund");
  });

  it("keeps the existing cancellation and contact sections present", () => {
    expect(termsSource).toContain("Cancellations &amp; rescheduling");
    expect(termsSource).toContain(">Contact</h2>");
  });
});
