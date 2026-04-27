import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/logWhatsAppEvent", () => ({
  logWhatsAppEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/whatsapp/whatsappMetaSafeguards", () => ({
  throttleWhatsAppMetaSend: vi.fn().mockResolvedValue(undefined),
  recordMetaSendOutcome: vi.fn(),
  isMetaSendCircuitOpen: vi.fn().mockReturnValue(false),
}));

describe("metaWhatsAppSend cleaner-only policy", () => {
  it("sendViaMetaWhatsApp throws when recipientRole is not cleaner", async () => {
    const { sendViaMetaWhatsApp } = await import("@/lib/dispatch/metaWhatsAppSend");
    await expect(
      sendViaMetaWhatsApp({
        phone: "+27123456789",
        message: "x",
        recipientRole: "not-cleaner" as "cleaner",
      }),
    ).rejects.toThrow("WhatsApp is restricted to cleaners only");
  });

  it("sendViaMetaWhatsAppTemplateBody throws when recipientRole is not cleaner", async () => {
    const { sendViaMetaWhatsAppTemplateBody } = await import("@/lib/dispatch/metaWhatsAppSend");
    await expect(
      sendViaMetaWhatsAppTemplateBody({
        phone: "+27123456789",
        templateName: "t",
        languageCode: "en",
        bodyParameters: ["a"],
        recipientRole: "not-cleaner" as "cleaner",
      }),
    ).rejects.toThrow("WhatsApp is restricted to cleaners only");
  });
});
