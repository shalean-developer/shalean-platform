export const CONTACT_FORM_RECIPIENT = "hello@shalean.co.za";

export const CONTACT_FORM_TOPICS = [
  { value: "new-booking", label: "New booking" },
  { value: "existing-booking", label: "Existing booking" },
  { value: "reschedule", label: "Reschedule" },
  { value: "payments", label: "Payments & invoices" },
  { value: "complaint", label: "Complaint or feedback" },
  { value: "cleaner-application", label: "Cleaner application" },
  { value: "business", label: "Business enquiry" },
  { value: "general", label: "General enquiry" },
] as const;

export type ContactFormTopic = (typeof CONTACT_FORM_TOPICS)[number]["value"];

const TOPIC_SET = new Set<string>(CONTACT_FORM_TOPICS.map((item) => item.value));

export function isContactFormTopic(value: unknown): value is ContactFormTopic {
  return typeof value === "string" && TOPIC_SET.has(value);
}

export function contactFormTopicLabel(value: ContactFormTopic): string {
  return CONTACT_FORM_TOPICS.find((item) => item.value === value)?.label ?? "General enquiry";
}
