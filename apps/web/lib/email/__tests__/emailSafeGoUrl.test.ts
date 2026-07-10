import { describe, expect, it } from "vitest";

import { emailSafeGoUrl } from "@/lib/email/emailSafeGoUrl";

describe("emailSafeGoUrl", () => {
  it("builds on-domain go URLs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://shalean.co.za";
    expect(emailSafeGoUrl("call")).toBe("https://shalean.co.za/go/call");
    expect(emailSafeGoUrl("whatsapp")).toBe("https://shalean.co.za/go/whatsapp");
  });
});
