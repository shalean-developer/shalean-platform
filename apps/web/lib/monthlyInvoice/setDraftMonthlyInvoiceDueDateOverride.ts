import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

function parseYmd(raw: unknown): string | null {
  const ymd = String(raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/** Returns admin-set draft due date override when present. */
export async function getDraftMonthlyInvoiceDueDateOverride(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("monthly_invoices")
    .select("due_date_override, due_date, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    if (String(error.message ?? "").includes("due_date_override")) return null;
    return null;
  }
  if (!data) return null;
  if (String((data as { status?: string }).status ?? "").toLowerCase() !== "draft") return null;
  const override = parseYmd((data as { due_date_override?: string | null }).due_date_override);
  if (override) return override;
  return null;
}

export async function setDraftMonthlyInvoiceDueDateOverride(
  admin: SupabaseClient,
  invoiceId: string,
  dueDateYmd: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ymd = parseYmd(dueDateYmd);
  if (!ymd) return { ok: false, error: "invalid_due_date" };

  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, month, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  const row = inv as { month?: string; status?: string | null } | null;
  if (!row) return { ok: false, error: "not_found" };
  if (String(row.status ?? "").toLowerCase() !== "draft") {
    return { ok: false, error: "invoice_not_draft" };
  }

  const month = String(row.month ?? "").trim();
  if (!month || !ymd.startsWith(month)) {
    return { ok: false, error: "due_date_must_be_in_billing_month" };
  }

  const { error: upErr } = await admin
    .from("monthly_invoices")
    .update({ due_date: ymd, due_date_override: ymd })
    .eq("id", invoiceId)
    .eq("status", "draft");

  if (upErr) {
    const msg = String(upErr.message ?? "");
    if (msg.includes("due_date_override")) {
      const { error: fallbackErr } = await admin
        .from("monthly_invoices")
        .update({ due_date: ymd })
        .eq("id", invoiceId)
        .eq("status", "draft");
      if (fallbackErr) return { ok: false, error: fallbackErr.message };
      return { ok: true };
    }
    return { ok: false, error: upErr.message };
  }
  return { ok: true };
}
