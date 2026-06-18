import "server-only";

import { createNotificationConfigBreaker } from "@/lib/email/notificationConfigBreaker";
import { buildMonthlyInvoiceSnapshot, wrapSnapshotCurrentV1 } from "@/lib/monthlyInvoice/buildMonthlyInvoiceSnapshot";
import { createZohoInvoice, todayYmdJhb } from "@/lib/zoho/zohoBooksService";
import {
  appendMonthlyInvoiceSnapshotEvent,
  invoicePaymentLinkEmailSentExists,
} from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { isInvoiceMonthReadyToFinalize, todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { initializePaystackForMonthlyInvoice } from "@/lib/monthlyInvoice/initializePaystackForMonthlyInvoice";
import { sendMonthlyInvoiceEmail } from "@/lib/monthlyInvoice/sendMonthlyInvoiceEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { settleMonthlyInvoiceChildren } from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildren";

export type FinalizeMonthlyInvoicesResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  today?: string;
  finalized?: number;
  errors?: string[];
};

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatDueDate(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00Z`);
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return isoDate;
  }
}

/**
 * Idempotent finalize for **closed billing periods only**:
 * draft rows pass {@link isInvoiceMonthReadyToFinalize} (today ≥ last calendar day of invoice `month`, Johannesburg).
 * SQL prefilter `month <= todayYm` avoids future buckets; the calendar predicate drops edge cases (e.g. same-month drafts).
 *
 * **Schedule (ops):** run **daily** — recommended **23:55 Africa/Johannesburg** (**21:55 UTC** on `vercel.json` crons).
 * Not tied to recurring generation timing; missed runs still finalize the same drafts later.
 *
 * **Collection:** Paystack **transaction/initialize** (hosted payment link + email). This is **not** card-on-file
 * `charge_authorization`; customer completes payment in browser; webhook applies `paid`.
 * Invoice unpaid states: `sent` / `partially_paid` / `overdue` (plus `sent_at`, `balance_cents`, `reminder_count`).
 *
 * **Zero balance:** `total_amount_cents === 0` → snapshot + mark `paid` with `closure_reason: zero_amount` (no Paystack).
 */
export async function finalizeDueMonthlyInvoices(): Promise<FinalizeMonthlyInvoicesResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, reason: "supabase_admin_missing" };

  const today = todayJohannesburg();
  const todayYm = today.slice(0, 7);
  const errors: string[] = [];
  let finalized = 0;

  // M-9: per-run circuit breaker. Trips on the FIRST permanent_config send
  // outcome and short-circuits the email step for every subsequent invoice
  // in the same run. Settlement (snapshot, status flip, Paystack init) is
  // never gated by the breaker — it only suppresses the Resend network call
  // and the per-invoice ops-log spam that used to follow it.
  const emailBreaker = createNotificationConfigBreaker({
    source: "cron/finalize-monthly-invoices",
    channel: "email",
  });

  const { data: draftRows, error } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status")
    .eq("status", "draft")
    .lte("month", todayYm);

  if (error) {
    await reportOperationalIssue("error", "cron/finalize-monthly-invoices", error.message);
    return { ok: false, reason: error.message, today };
  }

  const drafts = (draftRows ?? []).filter((r) =>
    isInvoiceMonthReadyToFinalize(today, String((r as { month?: string }).month ?? "")),
  );

  for (const raw of drafts) {
    const inv = raw as { id: string; customer_id: string; month: string; due_date: string; status: string };
    const { error: rpcErr } = await admin.rpc("recompute_monthly_invoice_totals", { p_invoice_id: inv.id });
    if (rpcErr) {
      errors.push(`${inv.id}: ${rpcErr.message}`);
      continue;
    }

    const { data: postRpc } = await admin.from("monthly_invoices").select("status").eq("id", inv.id).maybeSingle();
    if (String(postRpc?.status ?? "").toLowerCase() !== "draft") {
      continue;
    }

    const { data: fresh, error: loadErr } = await admin
      .from("monthly_invoices")
      .select("id, total_amount_cents, due_date, month")
      .eq("id", inv.id)
      .maybeSingle();

    if (loadErr || !fresh) {
      errors.push(`${inv.id}: reload_failed`);
      continue;
    }

    const f = fresh as { id: string; total_amount_cents: number | null; due_date: string; month: string };
    const cents = Math.max(0, Math.round(Number(f.total_amount_cents ?? 0)));

    if (cents === 0) {
      const nowIso = new Date().toISOString();
      const snapshot = await buildMonthlyInvoiceSnapshot(admin, f.id);
      if (!snapshot) {
        errors.push(`${f.id}: snapshot_build_failed`);
        continue;
      }
      const snapshotCurrent = wrapSnapshotCurrentV1(snapshot);
      const bookingCount = Math.round(Number(snapshot.totals.total_bookings ?? 0));
      const { error: snapDraftErr } = await admin
        .from("monthly_invoices")
        .update({
          snapshot_at_finalize: snapshot,
          snapshot_current: snapshotCurrent,
          snapshot_version: 1,
          finalized_at: nowIso,
        })
        .eq("id", f.id)
        .eq("status", "draft");
      if (snapDraftErr) {
        errors.push(`${f.id}: zero_snapshot:${snapDraftErr.message}`);
        continue;
      }
      const finEv = await appendMonthlyInvoiceSnapshotEvent(
        admin,
        f.id,
        {
          kind: "invoice_finalized",
          at: nowIso,
          total_amount_cents: cents,
          booking_count: bookingCount,
        },
        { source: "cron/finalize-monthly-invoices" },
      );
      if (!finEv.ok) {
        errors.push(`${f.id}: finalize_event:${finEv.error}`);
      }
      const { error: zeroPaidErr } = await admin
        .from("monthly_invoices")
        .update({
          status: "paid",
          closure_reason: "zero_amount",
        })
        .eq("id", f.id)
        .eq("status", "draft");
      if (zeroPaidErr) {
        errors.push(`${f.id}: zero_close:${zeroPaidErr.message}`);
        continue;
      }
      const { data: lines } = await admin
        .from("bookings")
        .select("id, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents")
        .eq("monthly_invoice_id", f.id)
        .neq("status", "cancelled");
      const childSettlement = await settleMonthlyInvoiceChildren(admin, {
        invoiceId: f.id,
        children: (lines ?? []) as {
          id: string;
          total_paid_zar: number | null;
          amount_paid_cents: number | null;
          display_earnings_cents: number | null;
          cleaner_payout_cents: number | null;
        }[],
        source: "cron/finalize-monthly-invoices",
        reference: "zero_amount",
      });
      if (!childSettlement.ok) {
        errors.push(`${f.id}: ${childSettlement.error}`);
        continue;
      }
      finalized++;
      continue;
    }

    const userRes = await admin.auth.admin.getUserById(inv.customer_id);
    const email = String(userRes.data.user?.email ?? "").trim().toLowerCase();
    if (!email) {
      errors.push(`${inv.id}: customer_email_missing`);
      continue;
    }

    const snapshot = await buildMonthlyInvoiceSnapshot(admin, f.id);
    if (!snapshot) {
      errors.push(`${f.id}: snapshot_build_failed`);
      continue;
    }
    const snapshotCurrent = wrapSnapshotCurrentV1(snapshot);
    const { data: snapRows, error: snapErr } = await admin
      .from("monthly_invoices")
      .update({
        snapshot_at_finalize: snapshot,
        snapshot_current: snapshotCurrent,
        snapshot_version: 1,
      })
      .eq("id", f.id)
      .eq("status", "draft")
      .select("id");
    if (snapErr) {
      errors.push(`${f.id}: snapshot_failed:${snapErr.message}`);
      continue;
    }
    if (!snapRows?.length) {
      continue;
    }

    const finEv = await appendMonthlyInvoiceSnapshotEvent(
      admin,
      f.id,
      {
        kind: "invoice_finalized",
        at: new Date().toISOString(),
        total_amount_cents: cents,
        booking_count: Math.round(Number(snapshot.totals.total_bookings ?? 0)),
      },
      { source: "cron/finalize-monthly-invoices" },
    );
    if (!finEv.ok) {
      errors.push(`${f.id}: finalize_event:${finEv.error}`);
    }

    const { data: prePay } = await admin.from("monthly_invoices").select("status").eq("id", f.id).maybeSingle();
    if (String(prePay?.status ?? "").toLowerCase() !== "draft") {
      continue;
    }

    const pay = await initializePaystackForMonthlyInvoice(admin, { invoiceId: f.id, customerEmail: email });
    if (!pay.ok) {
      errors.push(`${f.id}: ${pay.error}`);
      continue;
    }

    const balanceZar = Math.max(0, cents) / 100;

    if (await invoicePaymentLinkEmailSentExists(admin, f.id)) {
      finalized++;
      continue;
    }

    // M-9: if a previous invoice in this run already proved the Resend
    // configuration is broken, don't take the dispatch claim or attempt
    // another network call — settlement above has already promoted the
    // invoice to `sent` with a usable `payment_link`, so the customer-
    // visible payable record is intact and a future cron tick (after ops
    // fix the misconfiguration) can resend via the admin "Resend invoice"
    // action.
    if (emailBreaker.shouldSkipRemainingSends()) {
      emailBreaker.recordSkippedInvoice(f.id);
      errors.push(`${f.id}: invoice_email_skipped:${emailBreaker.skipReason()}`);
      continue;
    }

    const { data: claimRows, error: claimErr } = await admin
      .from("monthly_invoices")
      .update({ initial_invoice_email_dispatch_claimed: true })
      .eq("id", f.id)
      .eq("initial_invoice_email_dispatch_claimed", false)
      .select("id");

    if (claimErr) {
      errors.push(`${f.id}: email_dispatch_claim:${claimErr.message}`);
      continue;
    }

    if (!claimRows?.length) {
      if (await invoicePaymentLinkEmailSentExists(admin, f.id)) {
        finalized++;
        continue;
      }
      continue;
    }

    const mail = await sendMonthlyInvoiceEmail({
      to: email,
      monthLabel: formatMonthLabel(f.month),
      totalZar: balanceZar,
      paymentUrl: pay.authorizationUrl,
      dueDateLabel: formatDueDate(f.due_date),
    });

    if (!mail.sent) {
      await emailBreaker.recordSendOutcome({
        classification: mail.classification,
        errorMessage: mail.error,
        invoiceId: f.id,
      });
      await admin
        .from("monthly_invoices")
        .update({ initial_invoice_email_dispatch_claimed: false })
        .eq("id", f.id);
      errors.push(`${f.id}: invoice_email:${mail.error ?? "send_failed"}`);
      continue;
    }

    const evAppend = await appendMonthlyInvoiceSnapshotEvent(
      admin,
      f.id,
      {
        kind: "invoice_payment_link_email_sent",
        at: new Date().toISOString(),
        actor: "system",
        paystack_reference: pay.reference,
      },
      { source: "cron/finalize-monthly-invoices" },
    );

    if (!evAppend.ok) {
      await admin
        .from("monthly_invoices")
        .update({ initial_invoice_email_dispatch_claimed: false })
        .eq("id", f.id);
      errors.push(`${f.id}: invoice_email_event:${evAppend.error}`);
      continue;
    }

    // Sync to Zoho Books (non-blocking — failures are logged but don't fail finalization)
    if (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN) {
      const zohoResult = await createZohoInvoice({
        referenceId: f.id,
        customerEmail: email,
        customerName: email,
        invoiceDate: todayYmdJhb(),
        dueDate: f.due_date,
        lineItems: [
          {
            name: `Shalean Cleaning — ${formatMonthLabel(f.month)}`,
            description: `Monthly cleaning invoice for ${formatMonthLabel(f.month)}`,
            rate: balanceZar,
            quantity: 1,
          },
        ],
        notes: `Shalean monthly invoice ${f.id}. Pay via: ${pay.authorizationUrl}`,
        currencyCode: "ZAR",
      });

      if (zohoResult.ok) {
        await admin
          .from("monthly_invoices")
          .update({ zoho_invoice_id: zohoResult.zohoInvoiceId })
          .eq("id", f.id);
      } else {
        errors.push(`${f.id}: zoho_sync:${zohoResult.error}`);
      }
    }

    finalized++;
  }

  await logSystemEvent({
    level: "info",
    source: "cron/finalize-monthly-invoices",
    message: "finalize_monthly_invoices_done",
    context: {
      today,
      todayYm,
      draft_candidates: drafts.length,
      finalized,
      error_count: errors.length,
      email_breaker: emailBreaker.snapshot(),
    },
  });

  return { ok: true, today, finalized, errors: errors.length ? errors : undefined };
}
