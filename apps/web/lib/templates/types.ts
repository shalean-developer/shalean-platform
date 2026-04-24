export type TemplateChannel = "email" | "whatsapp" | "sms";

export type TemplateRow = {
  id: string;
  key: string;
  channel: TemplateChannel;
  subject: string | null;
  content: string;
  variables: unknown;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};
