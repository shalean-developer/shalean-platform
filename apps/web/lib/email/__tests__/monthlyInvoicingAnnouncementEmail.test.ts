import { describe, expect, it } from "vitest";

import {
  buildMonthlyInvoicingAnnouncementHtml,
  buildMonthlyInvoicingAnnouncementSubject,
  MONTHLY_INVOICING_ANNOUNCEMENT_EFFECTIVE_LABEL,
} from "@/lib/email/monthlyInvoicingAnnouncementEmail";

describe("monthlyInvoicingAnnouncementEmail", () => {
  it("includes effective date and late fee policy", () => {
    const html = buildMonthlyInvoicingAnnouncementHtml({ to: "a@example.com", firstName: "Nicole" });
    expect(buildMonthlyInvoicingAnnouncementSubject()).toContain(MONTHLY_INVOICING_ANNOUNCEMENT_EFFECTIVE_LABEL);
    expect(html).toContain("Hi Nicole");
    expect(html).toContain("1 July 2026");
    expect(html).toContain("5% of the invoice");
    expect(html).toContain("R75");
    expect(html).toContain("R200");
    expect(html).toContain("last scheduled clean");
  });

  it("uses generic greeting when name missing", () => {
    const html = buildMonthlyInvoicingAnnouncementHtml({ to: "a@example.com" });
    expect(html).toContain("Hi there");
  });
});
