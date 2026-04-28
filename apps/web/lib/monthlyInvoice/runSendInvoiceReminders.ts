import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDueDateLabel, formatMonthLongYearUtc } from "@/lib/admin/invoices/invoiceAdminFormatters";
import { sendViaMetaWhatsApp } from "@/lib/dispatch/metaWhatsAppSend";
import { daysPastDueJhb } from "@/lib/dashboard/invoiceOverdueEscalation";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { appendMonthlyInvoiceSnapshotEvent, type InvoiceSnapshotEvent } from "@/lib/monthlyInvoice/invoiceSnapshotEvents";
import { sendMonthlyInvoiceReminderEmail } from "@/lib/monthlyInvoice/sendMonthlyInvoiceEmail";
import { johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

const REMINDER_DAY_OFFSETS = new Set([3, 7, 14]);

type ReminderChannel = "email" | "whatsapp";

export type SendInvoiceRemindersChannelStats = {
  sent: number;
  failed: number;
  skipped: number;
};

export type SendInvoiceRemindersResult =
  | {
      ok: true;
      todayJhb: string;
      total_checked: number;
      total_sent: number;
      total_failed: number;
      by_channel: {
        email: SendInvoiceRemindersChannelStats;
        whatsapp: SendInvoiceRemindersChannelStats;
      };
    }
  | { ok: false; error: string };

type InvoiceRow = {
  id: string;
  customer_id: string;
  month: string;
  due_date: string | null;
  payment_link: string | null;
  balance_cents: number | null;
  total_amount_cents: number | null;
  amount_paid_cents: number | null;
  status: string;
  is_closed: boolean;
};

function reminderDedupKey(invoiceId: string, dayOffset: number, channel: ReminderChannel): string {
  return `${invoiceId}:${dayOffset}:${channel}`;
}

/** Prefer canonical SA mobile (+27…); fall back to ZA-first E.164 heuristic (same as admin resend). */
function resolveCustomerPhoneForWhatsApp(phoneRaw: string): string | null {
  const sa = normalizeSouthAfricaPhone(phoneRaw);
  if (sa) return sa;
  const e164 = customerPhoneToE164(phoneRaw).trim();
  const d = e164.replace(/\D/g, "");
  if (d.length >= 11 && d.startsWith("27")) return e164.startsWith("+") ? e164 : `+${d}`;
  return null;
}

function emptyChannelStats(): SendInvoiceRemindersChannelStats {
  return { sent: 0, failed: 0, skipped: 0 };
}

async function appendReminderEvent(
  admin: SupabaseClient,
  invoiceId: string,
  atIso: string,
  body: Omit<Extract<InvoiceSnapshotEvent, { kind: "invoice_reminder_sent" }>, "kind" | "at">,
): Promise<boolean> {
  const r = await appendMonthlyInvoiceSnapshotEvent(
    admin,
    invoiceId,
    {
      kind: "invoice_reminder_sent",
      at: atIso,
      ...body,
    },
    { source: "cron/send-invoice-reminders" },
  );
  if (!r.ok) {
    await reportOperationalIssue("warn", "cron/send-invoice-reminders", "reminder_event_append_failed", {
      invoice_id: invoiceId,
      error: r.error,
    });
  }
  return r.ok;
}

/**
 * Daily cron: invoices with balance, sent/partially_paid, not closed, due in the past,
 * and whole calendar days past due in {3, 7, 14} (Johannesburg “today”).
 */
export async function runSendInvoiceReminders(admin: SupabaseClient): Promise<SendInvoiceRemindersResult> {
  const nowSnapshot = new Date();
  const todayJhb = johannesburgTodayYmd(nowSnapshot);

  const { data: rows, error: qErr } = await admin
    .from("monthly_invoices")
    .select(
      "id, customer_id, month, due_date, payment_link, balance_cents, total_amount_cents, amount_paid_cents, status, is_closed",
    )
    .gt("balance_cents", 0)
    .in("status", ["sent", "partially_paid"])
    .eq("is_closed", false);

  if (qErr) {
    return { ok: false, error: qErr.message };
  }

  const all = (rows ?? []) as InvoiceRow[];

  const eligible: Array<InvoiceRow & { day_offset: number }> = [];
  for (const inv of all) {
    const due = inv.due_date;
    if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    const dayOffset = daysPastDueJhb(due, nowSnapshot);
    if (!REMINDER_DAY_OFFSETS.has(dayOffset)) continue;
    eligible.push({ ...inv, day_offset: dayOffset });
  }

  const by_channel = {
    email: emptyChannelStats(),
    whatsapp: emptyChannelStats(),
  };

  if (eligible.length === 0) {
    return {
      ok: true,
      todayJhb,
      total_checked: 0,
      total_sent: 0,
      total_failed: 0,
      by_channel,
    };
  }

  const invoiceIds = [...new Set(eligible.map((e) => e.id))];

  const { data: eventRows, error: evErr } = await admin
    .from("monthly_invoice_events")
    .select("invoice_id, payload")
    .in("invoice_id", invoiceIds)
    .eq("kind", "invoice_reminder_sent");

  if (evErr) {
    return { ok: false, error: evErr.message };
  }

  const sentKeys = new Set<string>();
  for (const row of eventRows ?? []) {
    const invId = String((row as { invoice_id?: string }).invoice_id ?? "");
    const payload = (row as { payload?: unknown }).payload;
    if (!invId || payload == null || typeof payload !== "object" || Array.isArray(payload)) continue;
    const o = payload as Record<string, unknown>;
    if (String(o.kind ?? "") !== "invoice_reminder_sent") continue;
    const off = Math.round(Number(o.day_offset ?? NaN));
    if (!REMINDER_DAY_OFFSETS.has(off)) continue;
    if (String(o.delivery_status ?? "").toLowerCase() !== "sent") continue;
    const ch: ReminderChannel = String(o.channel ?? "").toLowerCase() === "whatsapp" ? "whatsapp" : "email";
    sentKeys.add(reminderDedupKey(invId, off, ch));
  }

  let total_sent = 0;
  let total_failed = 0;
  const nowIso = nowSnapshot.toISOString();

  for (const inv of eligible) {
    const total = Math.max(0, Math.round(Number(inv.total_amount_cents ?? 0)));
    const paid = Math.max(0, Math.round(Number(inv.amount_paid_cents ?? 0)));
    const balance =
      typeof inv.balance_cents === "number" && Number.isFinite(inv.balance_cents)
        ? Math.max(0, Math.round(inv.balance_cents))
        : Math.max(0, total - paid);

    const paymentUrl = String(inv.payment_link ?? "").trim();
    const monthLabel = formatMonthLongYearUtc(inv.month);
    const dueLabel = formatDueDateLabel(inv.due_date);
    const dayOffset = inv.day_offset;

    const { data: udata, error: uerr } = await admin.auth.admin.getUserById(inv.customer_id);
    const user = !uerr ? udata?.user : undefined;
    const email = user?.email ? String(user.email).trim().toLowerCase() : "";
    const phoneRaw = typeof user?.phone === "string" ? user.phone.trim() : "";
    const phoneForWa = phoneRaw ? resolveCustomerPhoneForWhatsApp(phoneRaw) : null;

    const zar = (cents: number) => (Number.isFinite(cents) ? cents / 100 : 0);

    const appendForChannel = async (
      channel: ReminderChannel,
      delivery_status: "sent" | "failed",
      error_message?: string | null,
    ) => {
      await appendReminderEvent(admin, inv.id, nowIso, {
        day_offset: dayOffset,
        channel,
        delivery_status,
        ...(error_message ? { error_message } : {}),
        amount_cents: balance,
        amount_paid_cents_after: paid,
        balance_cents_after: balance,
        actor: "system",
        reference: `reminder:${channel}`,
      });
    };

    // --- Email ---
    const emailKey = reminderDedupKey(inv.id, dayOffset, "email");
    if (sentKeys.has(emailKey)) {
      by_channel.email.skipped += 1;
    } else if (!email) {
      by_channel.email.skipped += 1;
    } else if (!paymentUrl) {
      by_channel.email.skipped += 1;
    } else {
      const emailRes = await sendMonthlyInvoiceReminderEmail({
        to: email,
        daysPastDue: dayOffset,
        monthLabel,
        totalZar: zar(total),
        paidZar: zar(paid),
        balanceZar: zar(balance),
        paymentUrl,
        dueDateLabel: dueLabel,
      });
      if (emailRes.sent) {
        await appendForChannel("email", "sent");
        total_sent += 1;
        by_channel.email.sent += 1;
        sentKeys.add(emailKey);
      } else {
        await appendForChannel("email", "failed", emailRes.error ?? "email_send_failed");
        total_failed += 1;
        by_channel.email.failed += 1;
        sentKeys.add(emailKey);
      }
    }

    // --- WhatsApp ---
    const waKey = reminderDedupKey(inv.id, dayOffset, "whatsapp");
    if (sentKeys.has(waKey)) {
      by_channel.whatsapp.skipped += 1;
    } else if (!phoneForWa) {
      by_channel.whatsapp.skipped += 1;
    } else if (!paymentUrl) {
      by_channel.whatsapp.skipped += 1;
    } else {
      const text =
        `Shalean — your invoice is overdue by ${dayOffset} day${dayOffset === 1 ? "" : "s"}.\n` +
        `Total: R${zar(total).toFixed(2)} · Paid: R${zar(paid).toFixed(2)} · Balance: R${zar(balance).toFixed(2)}\n` +
        `Due: ${dueLabel}\n` +
        `Pay: ${paymentUrl}`;

      const waRes = await sendViaMetaWhatsApp({
        phone: phoneForWa,
        message: text.slice(0, 4090),
        recipientRole: "customer",
      });

      if (waRes.ok) {
        await appendForChannel("whatsapp", "sent");
        total_sent += 1;
        by_channel.whatsapp.sent += 1;
        sentKeys.add(waKey);
      } else {
        await appendForChannel("whatsapp", "failed", waRes.error ?? "whatsapp_send_failed");
        total_failed += 1;
        by_channel.whatsapp.failed += 1;
        sentKeys.add(waKey);
      }
    }
  }

  await logSystemEvent({
    level: "info",
    source: "cron/send-invoice-reminders",
    message: "invoice_reminders_run_complete",
    context: {
      todayJhb,
      total_checked: eligible.length,
      total_sent,
      total_failed,
      by_channel,
    },
  });

  return {
    ok: true,
    todayJhb,
    total_checked: eligible.length,
    total_sent,
    total_failed,
    by_channel,
  };
}
