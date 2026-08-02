import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_GENERAL_SEGMENT_ID = "186735a1-8efb-452f-a5fa-3a43c2899722";

const INTERNAL_DOMAINS = new Set(["shalean.com", "shalean.co.za"]);

function isEligibleCustomerEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.endsWith("@walkin.shalean.com")) return false;
  const domain = normalized.split("@")[1] ?? "";
  return !INTERNAL_DOMAINS.has(domain);
}

function splitName(fullName: string | null | undefined): { firstName?: string; lastName?: string } {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
}

/**
 * Best-effort sync of a customer into the Resend Audience.
 * This must never block or fail a transactional email send.
 */
export async function syncResendAudienceContact(input: {
  email: string;
  customerId?: string | null;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || !isEligibleCustomerEmail(email)) return;

  let firstName: string | undefined;
  let lastName: string | undefined;
  let unsubscribed = false;

  const admin = getSupabaseAdmin();
  if (admin && input.customerId) {
    const { data } = await admin
      .from("user_profiles")
      .select("full_name, marketing_emails_unsubscribed_at, role")
      .eq("id", input.customerId)
      .maybeSingle();

    if (data?.role && data.role !== "customer") return;
    ({ firstName, lastName } = splitName(data?.full_name));
    unsubscribed = Boolean(data?.marketing_emails_unsubscribed_at);
  }

  const segmentId = process.env.RESEND_AUDIENCE_SEGMENT_ID?.trim() || DEFAULT_GENERAL_SEGMENT_ID;
  const response = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      firstName,
      lastName,
      unsubscribed,
      segmentIds: [segmentId],
    }),
  });

  // Existing contacts are already safely present in the Audience.
  if (response.ok || response.status === 409) return;

  const detail = await response.text().catch(() => "");
  console.warn("Resend audience contact sync failed", {
    email,
    status: response.status,
    detail: detail.slice(0, 300),
  });
}
