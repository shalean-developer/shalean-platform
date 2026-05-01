const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CustomerDetailsInput = {
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
};

export function validateCustomerDetails(input: CustomerDetailsInput): { ok: true } | { ok: false; error: string } {
  const name = String(input.customerName ?? "").trim();
  const email = String(input.customerEmail ?? "").trim().toLowerCase();
  const phone = String(input.customerPhone ?? "").trim();
  if (!name) return { ok: false, error: "Enter your full name." };
  if (!email) return { ok: false, error: "Enter your email." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!phone) return { ok: false, error: "Enter your phone number." };
  if (phone.length < 7) return { ok: false, error: "Enter a valid phone number." };
  return { ok: true };
}
