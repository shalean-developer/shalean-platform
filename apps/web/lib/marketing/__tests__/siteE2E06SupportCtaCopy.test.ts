import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const footer = readFileSync(
  join(process.cwd(), "components/marketing-home/sections/MarketingHomeFooter.tsx"),
  "utf8",
);

describe("SITE-E2E-06 support CTA email copy", () => {
  it("does not concatenate 'support' twice in the shared contact block", () => {
    expect(footer).not.toContain(">Email support</span>");
  });

  it("renders a distinct Email label followed by explicit whitespace and the support address", () => {
    expect(footer).toContain(
      '>Email</span>{" "}\n            <span className="mt-1 block font-medium group-hover:text-[#0033A1]">{CUSTOMER_SUPPORT_EMAIL}</span>',
    );
  });

  it("keeps the canonical support email constant as the value and mailto target", () => {
    expect(footer).toContain('href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`}');
    expect(footer).toContain("{CUSTOMER_SUPPORT_EMAIL}");
  });
});
