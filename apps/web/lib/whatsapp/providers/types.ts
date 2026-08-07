export type WhatsAppRecipientRole = "cleaner" | "customer";

export type WhatsAppSendResult = {
  ok: boolean;
  messageId?: string;
  provider: "meta" | "flaxxa";
  error?: string;
};

export type WhatsAppTemplateInput = {
  phone: string;
  templateName: string;
  language?: string;
  bodyParams?: string[];
  recipientRole: WhatsAppRecipientRole;
};

export type WhatsAppTextInput = {
  phone: string;
  message: string;
  recipientRole: WhatsAppRecipientRole;
};

export interface WhatsAppProvider {
  sendText(input: WhatsAppTextInput): Promise<WhatsAppSendResult>;
  sendTemplate(input: WhatsAppTemplateInput): Promise<WhatsAppSendResult>;
}
