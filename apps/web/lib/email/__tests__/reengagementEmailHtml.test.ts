import { describe, expect, it } from "vitest";
import { buildReengagementEmailHtml, buildReengagementEmailSubject } from "@/lib/email/reengagementEmailHtml";

describe("reengagementEmailHtml", () => {
  it("includes personalised greeting when first name is provided", () => {
    const html = buildReengagementEmailHtml({
      rebookUrl: "https://shalean.co.za/rebook?t=abc",
      bookUrl: "https://shalean.co.za/book",
      firstName: "Sarah",
    });
    expect(html).toContain("Welcome back, Sarah!");
    expect(html).toContain("Book My Next Cleaning");
    expect(html).toContain("Trusted by homeowners across Cape Town");
  });

  it("uses generic greeting without first name", () => {
    const html = buildReengagementEmailHtml({
      rebookUrl: "https://shalean.co.za/rebook",
      bookUrl: "https://shalean.co.za/book",
    });
    expect(html).toContain("Welcome Back!");
    expect(html).not.toContain("Welcome back,");
  });

  it("builds subject with first name", () => {
    expect(buildReengagementEmailSubject("Sarah")).toContain("Sarah");
  });
});
