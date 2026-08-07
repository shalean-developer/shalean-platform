import "server-only";

export type WhatsAppTemplateAudience = "customer" | "cleaner";
export type WhatsAppTemplateCategory = "UTILITY" | "MARKETING";

export type WhatsAppTemplateSpec = {
  key: string;
  audience: WhatsAppTemplateAudience;
  category: WhatsAppTemplateCategory;
  language: "en";
  variables: readonly string[];
  body: string;
  envVar?: string;
};

/**
 * Canonical Shalean WhatsApp template catalogue.
 *
 * These definitions are internal product contracts. A row existing here or in
 * Supabase does NOT mean Meta has approved the template. Production sends must
 * only use templates that exist and are approved in WhatsApp Manager.
 */
export const WHATSAPP_TEMPLATE_CATALOG: readonly WhatsAppTemplateSpec[] = [
  {
    key: "booking_confirmed",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "date", "time", "price"],
    body: "Hi {{1}}, your Shalean cleaning is confirmed for {{2}} at {{3}}. Total: {{4}}.",
    envVar: "WHATSAPP_TEMPLATE_BOOKING_CONFIRMED",
  },
  {
    key: "payment_request",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "booking_id", "amount", "payment_link"],
    body: "Hi {{1}}, payment is required for booking {{2}}. Amount: {{3}}. Pay securely here: {{4}}",
    envVar: "WHATSAPP_TEMPLATE_PAYMENT_REQUEST",
  },
  {
    key: "payment_confirmed",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "booking_id", "amount"],
    body: "Hi {{1}}, we have received payment for booking {{2}}. Amount received: {{3}}. Thank you.",
    envVar: "WHATSAPP_TEMPLATE_PAYMENT_CONFIRMED",
  },
  {
    key: "booking_reminder_24h",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "date", "time", "service"],
    body: "Hi {{1}}, reminder: your {{4}} cleaning is booked for {{2}} at {{3}}. We look forward to serving you.",
    envVar: "WHATSAPP_TEMPLATE_BOOKING_REMINDER_24H",
  },
  {
    key: "customer_booking_assigned",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "cleaner_name", "date", "time"],
    body: "Hi {{1}}, {{2}} has been assigned to your Shalean booking on {{3}} at {{4}}.",
    envVar: "WHATSAPP_TEMPLATE_CUSTOMER_BOOKING_ASSIGNED",
  },
  {
    key: "booking_rescheduled",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "booking_id", "date", "time"],
    body: "Hi {{1}}, booking {{2}} has been rescheduled to {{3}} at {{4}}.",
    envVar: "WHATSAPP_TEMPLATE_BOOKING_RESCHEDULED",
  },
  {
    key: "booking_cancelled",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "booking_id", "date"],
    body: "Hi {{1}}, booking {{2}} for {{3}} has been cancelled. Contact Shalean if you need help rebooking.",
    envVar: "WHATSAPP_TEMPLATE_BOOKING_CANCELLED",
  },
  {
    key: "job_completed",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "booking_id"],
    body: "Hi {{1}}, booking {{2}} has been marked complete. Thank you for choosing Shalean Cleaning Services.",
    envVar: "WHATSAPP_TEMPLATE_JOB_COMPLETED",
  },
  {
    key: "review_prompt",
    audience: "customer",
    category: "UTILITY",
    language: "en",
    variables: ["customer_name", "review_link"],
    body: "Hi {{1}}, thank you for choosing Shalean. Please share your feedback here: {{2}}",
    envVar: "WHATSAPP_TEMPLATE_REVIEW_PROMPT",
  },
  {
    key: "booking_offer",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["cleaner_name", "location", "date", "time", "pay"],
    body: "Hi {{1}}, new Shalean job available. {{2}} · {{3}} · {{4}} · {{5}}. Reply 1 to ACCEPT or 2 to DECLINE.",
    envVar: "WHATSAPP_TEMPLATE_BOOKING_OFFER",
  },
  {
    key: "offer_ack",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["line"],
    body: "{{1}}",
    envVar: "WHATSAPP_TEMPLATE_OFFER_ACK",
  },
  {
    key: "booking_assigned",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["location", "date", "time"],
    body: "Shalean job assigned: {{1}} · {{2}} · {{3}}. Please arrive on time and follow the booking instructions.",
    envVar: "WHATSAPP_TEMPLATE_BOOKING_ASSIGNED",
  },
  {
    key: "reminder",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["location", "time"],
    body: "Reminder: you have a Shalean job at {{1}} at {{2}}. Contact your supervisor immediately if there is an issue.",
    envVar: "WHATSAPP_TEMPLATE_REMINDER",
  },
  {
    key: "escalation",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["location", "time", "booking_id"],
    body: "Urgent Shalean job {{3}} needs attention at {{1}} · {{2}}. Reply if you can assist.",
    envVar: "WHATSAPP_TEMPLATE_ESCALATION",
  },
  {
    key: "cleaner_welcome",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["line"],
    body: "{{1}}",
    envVar: "WHATSAPP_TEMPLATE_CLEANER_WELCOME",
  },
  {
    key: "cleaner_approved",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["line"],
    body: "{{1}}",
    envVar: "WHATSAPP_TEMPLATE_CLEANER_APPROVED",
  },
  {
    key: "cleaner_booking_changed",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["booking_id", "date", "time", "location"],
    body: "Booking {{1}} has changed. New details: {{2}} · {{3}} · {{4}}. Check the Shalean app before travelling.",
    envVar: "WHATSAPP_TEMPLATE_CLEANER_BOOKING_CHANGED",
  },
  {
    key: "cleaner_booking_cancelled",
    audience: "cleaner",
    category: "UTILITY",
    language: "en",
    variables: ["booking_id", "date", "location"],
    body: "Booking {{1}} for {{2}} at {{3}} has been cancelled. Do not travel to the job unless Shalean reassigns it.",
    envVar: "WHATSAPP_TEMPLATE_CLEANER_BOOKING_CANCELLED",
  },
] as const;

export type WhatsAppTemplateKey = (typeof WHATSAPP_TEMPLATE_CATALOG)[number]["key"];

export function getWhatsAppTemplateSpec(key: string): WhatsAppTemplateSpec | null {
  return WHATSAPP_TEMPLATE_CATALOG.find((item) => item.key === key) ?? null;
}

export function resolveConfiguredMetaTemplateName(key: string): string {
  const spec = getWhatsAppTemplateSpec(key);
  if (!spec) return key;
  const configured = spec.envVar ? process.env[spec.envVar]?.trim() : "";
  return configured || spec.key;
}
