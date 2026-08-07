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
      language: input.language || "en",
      bodyParams: input.bodyParams || [],
      recipientRole: input.recipientRole,
    });
    return { ...result, provider: "meta" as const };
  },
};

export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = (process.env.WHATSAPP_PROVIDER || "meta").trim().toLowerCase();
  if (provider === "flaxxa") return flaxxaWhatsAppProvider;
  return metaWhatsAppProvider;
}

export type { WhatsAppProvider, WhatsAppTemplateInput, WhatsAppTextInput } from "./types";
