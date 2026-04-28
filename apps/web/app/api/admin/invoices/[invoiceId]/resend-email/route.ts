import { NextResponse } from "next/server";

import {
  rememberIdempotentAdminInvoicePost,
  replayIdempotentAdminInvoicePost,
} from "@/lib/admin/adminInvoiceIdempotency";
import { formatDueDateLabel, formatMonthLongYearUtc } from "@/lib/admin/invoices/invoiceAdminFormatters";
import { sendViaMetaWhatsApp } from "@/lib/dispatch/metaWhatsAppSend";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { appendMonthlyInvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { sendMonthlyInvoiceEmail } from "@/lib/monthlyInvoice/sendMonthlyInvoiceEmail";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prefer canonical SA mobile (+27…); fall back to ZA-first E.164 heuristic. */
function resolveCustomerPhoneForWhatsApp(phoneRaw: string): string | null {
  const sa = normalizeSouthAfricaPhone(phoneRaw);
  if (sa) return sa;
  const e164 = customerPhoneToE164(phoneRaw).trim();
  const d = e164.replace(/\D/g, "");
  if (d.length >= 11 && d.startsWith("27")) return e164.startsWith("+") ? e164 : `+${d}`;
  return null;
}

export async function POST(request: Request, ctx: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { invoiceId } = await ctx.params;
  if (!invoiceId) return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const replay = await replayIdempotentAdminInvoicePost(admin, request, invoiceId, "resend_invoice");
  if (replay) return replay;

  const body = (await request.json().catch(() => ({}))) as { channel?: unknown };
  const channel = String(body.channel ?? "email").toLowerCase();
  if (channel !== "email" && channel !== "whatsapp") {
    return NextResponse.json({ error: "Unsupported channel. Use email or whatsapp." }, { status: 400 });
  }

  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, payment_link, balance_cents, total_amount_cents, amount_paid_cents, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const row = inv as {
    id: string;
    customer_id: string;
    month: string;
    due_date: string | null;
    payment_link: string | null;
    balance_cents: number | null;
    total_amount_cents: number | null;
    amount_paid_cents: number | null;
    status: string | null;
  };

  const paymentUrl = String(row.payment_link ?? "").trim();
  if (!paymentUrl) {
    return NextResponse.json({ error: "No payment link on file. Initialize Paystack for this invoice first." }, { status: 400 });
  }

  const { data: udata, error: uerr } = await admin.auth.admin.getUserById(row.customer_id);
  if (uerr || !udata?.user?.email) {
    return NextResponse.json({ error: "Could not resolve customer email." }, { status: 400 });
  }

  const email = String(udata.user.email).trim().toLowerCase();
  const total = Math.max(0, Math.round(Number(row.total_amount_cents ?? 0)));
  const paid = Math.max(0, Math.round(Number(row.amount_paid_cents ?? 0)));
  const balance =
    typeof row.balance_cents === "number" && Number.isFinite(row.balance_cents)
      ? Math.max(0, Math.round(row.balance_cents))
      : Math.max(0, total - paid);
  const monthLabel = formatMonthLongYearUtc(row.month);
  const dueLabel = formatDueDateLabel(row.due_date);

  const nowIso = new Date().toISOString();

  const appendInvoiceResent = async (params: {
    channel: "email" | "whatsapp";
    reference: string;
    delivery_status: "sent" | "failed";
    error_message?: string | null;
  }) => {
    await appendMonthlyInvoiceSnapshotEvent(
      admin,
      invoiceId,
      {
        kind: "invoice_resent",
        at: nowIso,
        channel: params.channel,
        actor: auth.email,
        reference: params.reference,
        balance_cents_after: balance,
        amount_paid_cents_after: paid,
        total_amount_cents: total,
        delivery_status: params.delivery_status,
        ...(params.error_message ? { error_message: params.error_message } : {}),
      },
      { source: "monthly_invoice/resend" },
    );
  };

  if (channel === "email") {
    const balanceZar = balance / 100;
    const sent = await sendMonthlyInvoiceEmail({
      to: email,
      monthLabel,
      totalZar: balanceZar,
      paymentUrl,
      dueDateLabel: dueLabel,
    });

    if (!sent.sent) {
      await appendInvoiceResent({
        channel: "email",
        reference: "resend:email",
        delivery_status: "failed",
        error_message: sent.error ?? "email_send_failed",
      });
      return NextResponse.json(
        { error: sent.error ?? "Email could not be sent (check RESEND_API_KEY and logs)." },
        { status: 502 },
      );
    }

    await admin.from("monthly_invoices").update({ sent_at: nowIso }).eq("id", invoiceId);
    await appendInvoiceResent({
      channel: "email",
      reference: "resend:email",
      delivery_status: "sent",
    });

    const payload = { ok: true as const, sentAt: nowIso, channel: "email" as const };
    await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "resend_invoice", 200, payload);
    return NextResponse.json(payload);
  }

  const phoneRaw = typeof udata.user.phone === "string" ? udata.user.phone.trim() : "";
  if (!phoneRaw) {
    return NextResponse.json(
      { error: "Customer has no phone on their account. Ask them to add a phone or use email." },
      { status: 400 },
    );
  }

  const phoneForWa = resolveCustomerPhoneForWhatsApp(phoneRaw);
  if (!phoneForWa) {
    return NextResponse.json(
      {
        error:
          "Could not parse customer phone as a South Africa mobile (expected 0…, +27…, or 27…). Ask them to update their profile.",
      },
      { status: 400 },
    );
  }

  const zar = (cents: number) => (Number.isFinite(cents) ? (cents / 100).toFixed(2) : "0.00");
  const text =
    `Shalean invoice (${monthLabel})\n` +
    `Total: R${zar(total)} · Paid: R${zar(paid)} · Balance due: R${zar(balance)}\n` +
    `Due: ${dueLabel}\n` +
    `Pay now: ${paymentUrl}`;

  const wa = await sendViaMetaWhatsApp({
    phone: phoneForWa,
    message: text.slice(0, 4090),
    recipientRole: "customer",
  });

  if (!wa.ok) {
    const errMsg = wa.error ?? "whatsapp_send_failed";
    await appendInvoiceResent({
      channel: "whatsapp",
      reference: "whatsapp:failed",
      delivery_status: "failed",
      error_message: errMsg,
    });
    return NextResponse.json(
      { error: errMsg },
      { status: 502 },
    );
  }

  await appendInvoiceResent({
    channel: "whatsapp",
    reference: wa.messageId ? `whatsapp:${wa.messageId}` : "whatsapp:text",
    delivery_status: "sent",
  });

  const payload = { ok: true as const, channel: "whatsapp" as const, messageId: wa.messageId ?? null };
  await rememberIdempotentAdminInvoicePost(admin, request, invoiceId, "resend_invoice", 200, payload);
  return NextResponse.json(payload);
}
