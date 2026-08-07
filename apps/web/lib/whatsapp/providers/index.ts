import { flaxxaWhatsAppProvider } from "./flaxxa";
import type { WhatsAppProvider, WhatsAppTemplateInput, WhatsAppTextInput } from "./types";
import {
  sendViaMetaWhatsApp,
  sendViaMetaWhatsAppTemplateBody,
} from "@/lib/dispatch/metaWhatsAppSend";

const metaWhatsAppProvider: WhatsAppProvider = {
  async sendText(input: WhatsAppTextInput) {
    const result = await sendViaMetaWhatsApp({
      phone: input.phone,
      message: input.message,
      recipientRole: input.recipientRole,
    });
    return { ...result, provider: "meta" as const };
  },
  async sendTemplate(input: WhatsAppTemplateInput) {
    const result = await sendViaMetaWhatsAppTemplateBody({
      phone: input.phone,
      templateName: input.templateName,
      languageCode: input.language || "en",
      bodyParameters: input.bodyParams || [],
      recipientRole: input.recipientRole,
    });
    return { ...result, provider: "meta" as const };
  },
};

export function getWhatsAppProviderName(): "meta" | "flaxxa" {
  return (process.env.WHATSAPP_PROVIDER || "meta").trim().toLowerCase() === "flaxxa"
    ? "flaxxa"
    : "meta";
}

export function getWhatsAppProvider(): WhatsAppProvider {
  return getWhatsAppProviderName() === "flaxxa" ? flaxxaWhatsAppProvider : metaWhatsAppProvider;
}

export type { WhatsAppProvider, WhatsAppTemplateInput, WhatsAppTextInput } from "./types";
