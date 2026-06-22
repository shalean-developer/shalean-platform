import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/lib/templates/render";
import { normalizeTemplateData } from "@/lib/templates/templateDefaults";

describe("normalizeTemplateData", () => {
  it("fills missing values with defaults", () => {
    const out = normalizeTemplateData(
      { service_name: "" },
      { defaults: { service_name: "Not provided", booking_date: "Pending" }, allowKeys: ["service_name", "booking_date"] },
    );
    expect(out.service_name).toBe("Not provided");
    expect(out.booking_date).toBe("Pending");
  });

  it("preserves non-empty values", () => {
    const out = normalizeTemplateData(
      { service_name: "Deep Clean" },
      { defaults: { service_name: "Not provided" } },
    );
    expect(out.service_name).toBe("Deep Clean");
  });
});

describe("renderTemplate rawHtmlKeys", () => {
  it("does not escape trusted HTML fragments", () => {
    const html = renderTemplate("Before {{block}} After", { block: "<a href='#'>Go</a>" }, {
      rawHtmlKeys: ["block"],
      escapeHtmlValues: true,
    });
    expect(html).toContain("<a href='#'>Go</a>");
    expect(html).not.toContain("&lt;a");
  });

  it("escapes untrusted values by default", () => {
    const html = renderTemplate("Hi {{name}}", { name: "<script>" }, { escapeHtmlValues: true });
    expect(html).toContain("&lt;script&gt;");
  });
});
