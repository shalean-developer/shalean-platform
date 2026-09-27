import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const termsSource = readFileSync(
  join(process.cwd(), "app/terms-of-service/page.tsx"),
  "utf8",
);
const normalizedTermsSource = termsSource.replace(/\s+/g, " ");

describe("SITE-E2E-11 satisfaction guarantee terms", () => {
  it("defines the satisfaction guarantee on the Terms page", () => {
    expect(normalizedTermsSource).toContain("Satisfaction guarantee");
    expect(normalizedTermsSource).toContain("confirmed cleaning scope");
    expect(normalizedTermsSource).toContain("reasonable cleaning standard");
    expect(normalizedTermsSource).toContain("corrective clean");
  });

  it("defines material exclusions", () => {
    expect(normalizedTermsSource).toContain("pre-existing damage");
    expect(normalizedTermsSource).toContain("permanent stains or deterioration");
    expect(normalizedTermsSource).toContain("maintenance or repairs");
    expect(normalizedTermsSource).toContain("specialist remediation");
    expect(normalizedTermsSource).toContain("items excluded from the selected service");
  });

  it("does not promise an automatic refund", () => {
    expect(normalizedTermsSource).toContain("is not automatic");
    expect(normalizedTermsSource).not.toContain("full refund");
    expect(normalizedTermsSource).not.toContain("automatic refund");
  });

  it("keeps the existing cancellation and contact sections present", () => {
    expect(normalizedTermsSource).toContain("Cancellations &amp; rescheduling");
    expect(normalizedTermsSource).toContain(">Contact</h2>");
  });
});
