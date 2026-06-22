import { describe, expect, it } from "vitest";
import { getShaleanEmailLogoUrl, getShaleanEmailSocialIconUrl, wrapBrandedEmailContent } from "@/lib/email/emailBrandShell";

describe("wrapBrandedEmailContent", () => {
  it("wraps inner content with Shalean logo header, social footer, and help copy", () => {
    const html = wrapBrandedEmailContent("<p>Hello</p>");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain('alt="Shalean Cleaning Services"');
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("087 153 5250");
    expect(html).toContain("082 591 5525");
    expect(html).toContain("Follow us");
    expect(html).toContain("facebook.com/shaleancleaning");
    expect(html).toContain("instagram.com/shalean_cleaning_services");
    expect(html).toContain("wa.me/27825915525");
    expect(html).not.toContain("WhatsApp (082 591 5525)");
    expect(html).toContain("Shalean Cleaning Services");
  });
});

describe("getShaleanEmailLogoUrl", () => {
  it("returns an embedded data-uri logo", () => {
    const url = getShaleanEmailLogoUrl();
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});

describe("getShaleanEmailSocialIconUrl", () => {
  it("returns embedded social icon data URIs", () => {
    const url = getShaleanEmailSocialIconUrl("instagram");
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});
