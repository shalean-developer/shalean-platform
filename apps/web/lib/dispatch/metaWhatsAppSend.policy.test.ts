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

import {
  sendViaMetaWhatsApp,
  sendViaMetaWhatsAppTemplateBody,
} from "@/lib/dispatch/metaWhatsAppSend";

describe("metaWhatsAppSend recipient role guard", () => {
  it("sendViaMetaWhatsApp throws when recipientRole is not cleaner or customer", async () => {
    await expect(
      sendViaMetaWhatsApp({
        phone: "+27123456789",
        message: "x",
        recipientRole: "not-cleaner" as "cleaner",
      }),
    ).rejects.toThrow("Invalid WhatsApp recipient role");
  });

  it("sendViaMetaWhatsAppTemplateBody throws when recipientRole is not cleaner or customer", async () => {
    await expect(
      sendViaMetaWhatsAppTemplateBody({
        phone: "+27123456789",
        templateName: "t",
        languageCode: "en",
        bodyParameters: ["a"],
        recipientRole: "not-cleaner" as "cleaner",
      }),
    ).rejects.toThrow("Invalid WhatsApp recipient role");
  });
});
