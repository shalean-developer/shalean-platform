import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { InvoiceTimelineDbEvent } from "@/lib/monthlyInvoice/buildInvoiceHumanTimeline";

export type AdminInvoiceBundle = {
  invoice: Record<string, unknown>;
  customerProfile: { id: string; full_name: string | null; account_billing_risk: string | null } | null;
  customerContact: { email: string | null; phone: string | null };
  bookings: Record<string, unknown>[];
  adjustments: Record<string, unknown>[];
  /** `created_by` user id → admin email (best-effort via Auth admin API). */
  adjustmentCreatorEmails: Record<string, string>;
  events: InvoiceTimelineDbEvent[];
  cleanersById: Record<string, { id: string; full_name: string | null }>;
};

function asEventRows(raw: unknown): InvoiceTimelineDbEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const row = r as Record<string, unknown>;
      const created_at = String(row.created_at ?? "");
      const payload = row.payload;
      const p = payload != null && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
      if (!created_at) return null;
      return { created_at, payload: p };
    })
    .filter((x): x is InvoiceTimelineDbEvent => x != null);
}

async function loadAdjustmentCreatorEmails(
  admin: SupabaseClient,
  adjustments: Record<string, unknown>[],
): Promise<Record<string, string>> {
  const ids = [...new Set(adjustments.map((a) => String(a.created_by ?? "")).filter(Boolean))];
  const out: Record<string, string> = {};
  for (const id of ids) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (!error && data?.user?.email) {
      out[id] = String(data.user.email).trim().toLowerCase();
    }
  }
  return out;
}

async function loadCleanersById(admin: SupabaseClient, bookings: Record<string, unknown>[]) {
  const ids = new Set<string>();
  for (const b of bookings) {
    const cid = b.cleaner_id;
    if (typeof cid === "string" && cid) ids.add(cid);
  }
  if (ids.size === 0) return {} as Record<string, { id: string; full_name: string | null }>;

  const { data, error } = await admin.from("cleaners").select("id, full_name").in("id", [...ids]);
  if (error || !data) return {};
  const map: Record<string, { id: string; full_name: string | null }> = {};
  for (const row of data as { id: string; full_name: string | null }[]) {
    map[row.id] = { id: row.id, full_name: row.full_name };
  }
  return map;
}

/**
 * Loads everything needed for the admin invoice details screen (service role).
 * Caller must enforce admin auth (e.g. API route + {@link requireAdminApi}).
 */
export async function loadAdminInvoiceBundle(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true; data: AdminInvoiceBundle } | { ok: false; error: "not_found" | "load_failed"; message?: string }> {
  const [invRes, bookRes, adjRes, evRes] = await Promise.all([
    admin.from("monthly_invoices").select("*").eq("id", invoiceId).maybeSingle(),
    admin.from("bookings").select("*").eq("monthly_invoice_id", invoiceId).order("date", { ascending: true }),
    admin.from("invoice_adjustments").select("*").eq("applied_to_invoice_id", invoiceId).order("created_at", { ascending: true }),
    admin.from("monthly_invoice_events").select("created_at, payload").eq("invoice_id", invoiceId).order("created_at"),
  ]);

  if (invRes.error) return { ok: false, error: "load_failed", message: invRes.error.message };
  if (!invRes.data) return { ok: false, error: "not_found" };
  if (bookRes.error) return { ok: false, error: "load_failed", message: bookRes.error.message };
  if (adjRes.error) return { ok: false, error: "load_failed", message: adjRes.error.message };
  if (evRes.error) return { ok: false, error: "load_failed", message: evRes.error.message };

  const invoice = invRes.data as Record<string, unknown>;
  const customerId = String(invoice.customer_id ?? "");

  const [profileRes, cleanersById] = await Promise.all([
    customerId
      ? admin.from("user_profiles").select("id, full_name, account_billing_risk").eq("id", customerId).maybeSingle()
      : Promise.resolve({
          data: null as { id: string; full_name: string | null; account_billing_risk: string | null } | null,
          error: null,
        }),
    loadCleanersById(admin, (bookRes.data ?? []) as Record<string, unknown>[]),
  ]);

  if (profileRes.error) return { ok: false, error: "load_failed", message: profileRes.error.message };

  let customerContact: { email: string | null; phone: string | null } = { email: null, phone: null };
  if (customerId) {
    const { data: udata, error: uerr } = await admin.auth.admin.getUserById(customerId);
    if (!uerr && udata?.user) {
      customerContact = {
        email: udata.user.email ?? null,
        phone: udata.user.phone ?? null,
      };
    }
  }

  const adjustments = (adjRes.data ?? []) as Record<string, unknown>[];
  const adjustmentCreatorEmails = await loadAdjustmentCreatorEmails(admin, adjustments);

  return {
    ok: true,
    data: {
      invoice,
      customerProfile: profileRes.data,
      customerContact,
      bookings: (bookRes.data ?? []) as Record<string, unknown>[],
      adjustments,
      adjustmentCreatorEmails,
      events: asEventRows(evRes.data),
      cleanersById,
    },
  };
}
