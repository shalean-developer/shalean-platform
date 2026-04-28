import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { daysPastDueJhb, invoiceOverdueEscalationText } from "@/lib/dashboard/invoiceOverdueEscalation";

export type CustomerInvoiceActivityLine = { title: string; detail: string; done: boolean };

function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateYmd(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd ?? "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Lightweight “timeline” from columns the customer can already read (no `monthly_invoice_events`).
 */
export function buildCustomerInvoiceActivity(inv: CustomerMonthlyInvoiceRow): CustomerInvoiceActivityLine[] {
  const lines: CustomerInvoiceActivityLine[] = [];

  lines.push({
    title: "Invoice created",
    detail: fmt(inv.created_at),
    done: true,
  });

  if (inv.sent_at) {
    lines.push({
      title: "Invoice sent",
      detail: `We sent your bill on ${fmt(inv.sent_at)}.`,
      done: true,
    });
  }

  if (inv.amount_paid_cents > 0) {
    lines.push({
      title: "Payment received",
      detail: formatZarFromCents(inv.amount_paid_cents),
      done: true,
    });
  }

  const balance =
    typeof inv.balance_cents === "number" && Number.isFinite(inv.balance_cents)
      ? inv.balance_cents
      : inv.total_amount_cents - inv.amount_paid_cents;

  if (balance > 0 && inv.status !== "paid") {
    lines.push({
      title: "Balance due",
      detail: formatZarFromCents(balance),
      done: false,
    });
  } else if (balance <= 0 && inv.amount_paid_cents > 0) {
    lines.push({
      title: "Balance updated",
      detail: balance < 0 ? `Overpaid by ${formatZarFromCents(-balance)}` : "Nothing owing.",
      done: true,
    });
  }

  if (inv.is_overdue && inv.status !== "paid") {
    const d = daysPastDueJhb(inv.due_date, new Date());
    const esc = invoiceOverdueEscalationText(d);
    lines.push({
      title: "Overdue",
      detail: `Past due date (${fmtDateYmd(inv.due_date)}). ${esc}`,
      done: false,
    });
  }

  if (inv.status === "paid") {
    lines.push({
      title: "Paid in full",
      detail: "Thank you — this billing month is settled.",
      done: true,
    });
  }

  return lines;
}
