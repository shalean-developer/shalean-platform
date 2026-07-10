import { afterEach, describe, expect, it } from "vitest";
import {
  getShaleanEmailLogoUrl,
  getShaleanEmailSocialIconUrl,
  wrapBrandedEmailContent,
} from "@/lib/email/emailBrandShell";

describe("wrapBrandedEmailContent", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("wraps inner content with Shalean logo header, social footer, and help copy", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://shalean.co.za";
    const html = wrapBrandedEmailContent("<p>Hello</p>");
    expect(html).toContain("https://shalean.co.za/images/shalean-logo.png");
    expect(html).not.toContain("data:image");
    expect(html).toContain('alt="Shalean Cleaning Services"');
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("087 153 5250");
    expect(html).toContain("082 591 5525");
    expect(html).toContain("https://shalean.co.za/go/call");
    expect(html).toContain("https://shalean.co.za/go/whatsapp");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("wa.me/");
    expect(html).not.toContain("facebook.com/");
    expect(html).not.toContain("instagram.com/");
    expect(html).toContain("Follow us");
    expect(html).toContain("https://shalean.co.za/go/facebook");
    expect(html).toContain("https://shalean.co.za/go/instagram");
    expect(html).not.toContain("WhatsApp (082 591 5525)");
    expect(html).toContain("Shalean Cleaning Services");
    expect(html).toContain("https://shalean.co.za/images/email/social-facebook.png");
    expect(html).toContain("https://shalean.co.za/images/email/social-instagram.png");
    expect(html).toContain("https://shalean.co.za/images/email/social-whatsapp.png");
  });
});

describe("getShaleanEmailLogoUrl", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns a hosted logo URL on the app origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://shalean.co.za";
    expect(getShaleanEmailLogoUrl()).toBe("https://shalean.co.za/images/shalean-logo.png");
  });
});

describe("getShaleanEmailSocialIconUrl", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns hosted social icon URLs on the app origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://shalean.co.za";
    expect(getShaleanEmailSocialIconUrl("instagram")).toBe(
      "https://shalean.co.za/images/email/social-instagram.png",
    );
  });
});
