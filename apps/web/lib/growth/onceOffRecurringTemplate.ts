import "server-only";

export const ONCE_OFF_RECURRING_TEMPLATE = {
  key: "once_off_to_recurring_offer",
  audience: "customer" as const,
  category: "MARKETING" as const,
  language: "en" as const,
  variables: ["first_name", "booking_link"] as const,
  body: "Hi {{1}}, thank you for choosing Shalean Cleaning Services before. If you'd like to keep your home consistently clean, you can now switch to recurring cleaning and save time on future bookings. Book your next recurring cleaning here: {{2}}. We'd be happy to help.",
  envVar: "WHATSAPP_TEMPLATE_ONCE_OFF_TO_RECURRING_OFFER",
} as const;
