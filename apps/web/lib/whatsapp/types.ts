export type WhatsAppQueuePayload =
  | { kind: "text"; text: string }
  | { kind: "template"; templateName: string; language?: string; bodyParams: string[] };
