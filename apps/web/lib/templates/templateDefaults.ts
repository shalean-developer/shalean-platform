const EMPTY_MARKERS = new Set(["", "—", "-", "n/a", "na"]);

export function isTemplateValueMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  const s = String(value).trim();
  if (!s) return true;
  return EMPTY_MARKERS.has(s.toLowerCase());
}

/** Safe fallbacks when template data omits a field (email templates). */
export const GENERIC_EMAIL_FIELD_DEFAULTS: Record<string, string> = {
  customer_name: "there",
  service: "Not provided",
  service_name: "Not provided",
  date: "Pending",
  booking_date: "Pending",
  time: "Pending",
  booking_time: "Pending",
  location: "Not provided",
  booking_address: "Not provided",
  suburb: "",
  suburb_row: "",
  extras: "",
  extras_label: "",
  extras_row: "",
  recurring_summary: "",
  recurring_row: "",
  price: "Not provided",
  total_price: "Not provided",
  payment_reference: "Not provided",
  payment_status: "Pending",
  booking_id: "Not provided",
  booking_reference: "Not provided",
  cleaner_name: "Cleaner assignment pending",
  cleaner_status: "Cleaner assignment pending",
  previous_date: "Pending",
  previous_time: "Pending",
  new_date: "Pending",
  new_time: "Pending",
  payment_url: "#",
  payment_method: "Paystack",
  account_url: "#",
  review_url: "#",
  continue_url: "#",
  quote_label: "",
  google_review_url: "",
  google_review_section: "",
  book_again_url: "",
  cleaner_substitution_notice: "",
  book_again_section: "",
};

export function getEmailTemplateDefaults(templateKey: string): Record<string, string> {
  if (templateKey === "booking_confirmed") {
    return {
      ...GENERIC_EMAIL_FIELD_DEFAULTS,
      payment_status: "Paid",
      cleaner_name: "Cleaner assignment pending",
    };
  }
  return { ...GENERIC_EMAIL_FIELD_DEFAULTS };
}

/** Keys whose substituted values are trusted pre-built HTML (skip escaping). */
export function getEmailTemplateRawHtmlKeys(templateKey: string): string[] {
  if (templateKey === "booking_confirmed") {
    return [
      "cleaner_substitution_notice",
      "book_again_section",
      "extras_row",
      "suburb_row",
      "recurring_row",
    ];
  }
  if (templateKey === "job_completed") {
    return ["google_review_section"];
  }
  return [];
}

export function normalizeTemplateData(
  data: Record<string, unknown>,
  options: {
    defaults?: Record<string, string>;
    allowKeys?: string[];
  } = {},
): Record<string, unknown> {
  const defaults = options.defaults ?? {};
  const out: Record<string, unknown> = { ...data };
  const keys = new Set<string>([
    ...Object.keys(out),
    ...Object.keys(defaults),
    ...(options.allowKeys ?? []),
  ]);

  for (const key of keys) {
    if (isTemplateValueMissing(out[key])) {
      out[key] = defaults[key] ?? "Not provided";
    }
  }
  return out;
}
