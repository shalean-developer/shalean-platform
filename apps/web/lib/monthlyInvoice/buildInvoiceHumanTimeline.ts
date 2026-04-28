import type { MonthlyInvoiceSnapshotV1 } from "@/lib/monthlyInvoice/buildMonthlyInvoiceSnapshot";
import { adjustmentCategoryLabel, parseAdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";

function formatZarFromCents(cents: number): string {
  const n = Number.isFinite(cents) ? cents : 0;
  const abs = Math.abs(n);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;
  const formatted = new Intl.NumberFormat("en-ZA", {
    minimumFractionDigits: minor === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major + minor / 100);
  return n < 0 ? `-R${formatted}` : `R${formatted}`;
}

function parseIso(s: unknown): number {
  if (typeof s !== "string" || !s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x != null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function eventLine(ev: Record<string, unknown>): string | null {
  const kind = String(ev.kind ?? "");
  const atMs = parseIso(ev.at);
  const day = atMs
    ? new Intl.DateTimeFormat("en-ZA", {
        month: "short",
        day: "numeric",
        timeZone: "Africa/Johannesburg",
      }).format(new Date(atMs))
    : "";

  if (kind === "payment_received" || kind === "payment_applied") {
    const amt = Math.round(Number(ev.amount_cents ?? 0));
    const settled = String(ev.settled ?? "");
    const suffix = settled === "full" ? " (full)" : settled === "partial" ? " (partial)" : "";
    const ref = String(ev.reference ?? ev.paystack_charge_reference ?? "").trim();
    const refPart = ref ? ` · ref ${ref.slice(0, 48)}${ref.length > 48 ? "…" : ""}` : "";
    return `${day} – Payment received (${formatZarFromCents(amt)})${suffix} · system${refPart}`;
  }

  if (kind === "adjustment_applied" || kind === "adjustment_post_send") {
    const amt = Math.round(Number(ev.amount_cents ?? 0));
    const reason = String(ev.reason ?? "").trim();
    const reasonPart = reason ? `, ${reason}` : "";
    const cat = parseAdjustmentCategory(ev.category);
    const catPart = cat !== "other" ? ` · ${adjustmentCategoryLabel(cat)}` : "";
    const bal = ev.balance_cents_after;
    const balPart =
      typeof bal === "number" && Number.isFinite(bal)
        ? ` · balance after ${formatZarFromCents(Math.max(0, Math.round(bal)))}`
        : "";
    const ref = String(ev.reference ?? "").trim();
    const refPart = ref ? ` · ${ref}` : "";
    return `${day} – Adjustment applied (${formatZarFromCents(amt)}${reasonPart})${catPart}${balPart}${refPart} · system`;
  }

  if (kind === "invoice_finalized" || kind === "finalize") {
    const total = Math.round(Number(ev.total_amount_cents ?? ev.total_cents ?? 0));
    const bc = Math.round(Number(ev.booking_count ?? 0));
    const bcPart = bc > 0 ? `, ${bc} booking${bc === 1 ? "" : "s"}` : "";
    return `${day} – Invoice finalized (${formatZarFromCents(total)}${bcPart}) · system`;
  }

  if (kind === "invoice_closed") {
    const via = String(ev.via ?? "manual");
    const note = via === "paid" ? " — after payment" : " — manual";
    return `${day} – Invoice closed${note} · system`;
  }

  if (kind === "admin_mark_paid") {
    const email = String(ev.admin_email ?? "").trim() || "admin";
    const uid = String(ev.admin_user_id ?? "").trim();
    const uidPart = uid ? ` · id ${uid.slice(0, 8)}…` : "";
    const rec = Math.round(Number(ev.amount_recorded_cents ?? ev.amount_cents ?? 0));
    const amtPart = rec > 0 ? ` · recorded ${formatZarFromCents(rec)}` : "";
    const bc = Math.round(Number(ev.booking_count_settled ?? 0));
    const bcPart = bc > 0 ? ` · ${bc} booking${bc === 1 ? "" : "s"} settled` : "";
    const note = String(ev.note ?? "").trim();
    const notePart = note ? ` · note: ${note.slice(0, 120)}${note.length > 120 ? "…" : ""}` : "";
    const ref = String(ev.reference ?? "manual").trim();
    const paidAfter = ev.amount_paid_cents_after;
    const paidPart =
      typeof paidAfter === "number" && Number.isFinite(paidAfter)
        ? ` · paid after ${formatZarFromCents(Math.max(0, Math.round(paidAfter)))}`
        : "";
    return `${day} – Marked paid by ${email}${uidPart}${amtPart}${paidPart}${bcPart}${notePart} · ref ${ref}`;
  }

  if (kind === "invoice_resent") {
    const ch = String(ev.channel ?? "email");
    const ref = String(ev.reference ?? "").trim();
    const bal = ev.balance_cents_after;
    const balPart =
      typeof bal === "number" && Number.isFinite(bal)
        ? ` · balance ${formatZarFromCents(Math.max(0, Math.round(bal)))}`
        : "";
    const ds = String(ev.delivery_status ?? "sent").toLowerCase();
    const dsPart = ds === "failed" ? " · failed" : " · sent";
    const err = String(ev.error_message ?? "").trim();
    const errPart = err ? ` (${err.slice(0, 120)}${err.length > 120 ? "…" : ""})` : "";
    return `${day} – Invoice resent (${ch})${dsPart}${errPart}${balPart}${ref ? ` · ${ref}` : ""} · ${String(ev.actor ?? "admin")}`;
  }

  if (kind === "invoice_reminder_sent") {
    const off = ev.day_offset != null ? String(ev.day_offset) : "?";
    const ch = String(ev.channel ?? "email");
    const ds = String(ev.delivery_status ?? "sent").toLowerCase() === "failed" ? "failed" : "sent";
    return `${day} – Invoice reminder (+${off}d, ${ch}) · ${ds} · system`;
  }

  if (kind) {
    return `${day} – ${kind.replace(/_/g, " ")}`;
  }
  return null;
}

function hasInvoiceFinalizedInPayloads(rows: { payload: unknown }[]): boolean {
  return rows.some((row) => {
    const k = String((asRecord(row.payload) ?? {}).kind ?? "");
    return k === "invoice_finalized" || k === "finalize";
  });
}

function rollingEventsHasFinalize(events: unknown[]): boolean {
  for (const item of events) {
    const ev = asRecord(item);
    const k = String(ev?.kind ?? "");
    if (k === "invoice_finalized" || k === "finalize") return true;
  }
  return false;
}

export type InvoiceTimelineDbEvent = {
  created_at: string;
  payload: Record<string, unknown>;
};

export type BuildInvoiceHumanTimelineInput = {
  /** Legacy rows only: set when `invoice_finalized` was never appended */
  finalizedAtIso?: string | null;
  totalAmountCentsAtFinalize?: number | null;
  snapshotAtFinalize?: MonthlyInvoiceSnapshotV1 | null;
  snapshotCurrent?: Record<string, unknown> | null;
  fullEventHistory?: InvoiceTimelineDbEvent[] | null;
};

/**
 * Sorted human-readable lines for admin invoice UI.
 * Prefers `fullEventHistory` when provided. No synthetic finalize when events already include `invoice_finalized`.
 */
export function buildInvoiceHumanTimeline(input: BuildInvoiceHumanTimelineInput): string[] {
  const lines: { t: number; text: string }[] = [];

  const snap = input.snapshotAtFinalize;
  const finalizedIso =
    input.finalizedAtIso ?? (typeof snap?.frozen_at === "string" ? snap.frozen_at : null) ?? null;
  const finalizeTotal =
    input.totalAmountCentsAtFinalize ??
    (snap?.totals?.total_amount_cents != null ? Math.round(Number(snap.totals.total_amount_cents)) : null);

  const full = input.fullEventHistory?.length
    ? [...input.fullEventHistory].sort((a, b) => parseIso(a.created_at) - parseIso(b.created_at))
    : null;

  const rawRolling = input.snapshotCurrent?.events;
  const rollingArr = Array.isArray(rawRolling) ? rawRolling : [];

  if (full) {
    if (finalizedIso && finalizeTotal != null && !hasInvoiceFinalizedInPayloads(full)) {
      const t = parseIso(finalizedIso);
      const day = t
        ? new Intl.DateTimeFormat("en-ZA", {
            month: "short",
            day: "numeric",
            timeZone: "Africa/Johannesburg",
          }).format(new Date(t))
        : "";
      lines.push({
        t,
        text: `${day} – Invoice finalized (${formatZarFromCents(finalizeTotal)})`,
      });
    }
    for (const row of full) {
      const ev = asRecord(row.payload) ?? {};
      const line = eventLine(ev);
      if (line) {
        lines.push({ t: parseIso(row.created_at) || parseIso(ev.at), text: line });
      }
    }
  } else {
    if (finalizedIso && finalizeTotal != null && !rollingEventsHasFinalize(rollingArr)) {
      const t = parseIso(finalizedIso);
      const day = t
        ? new Intl.DateTimeFormat("en-ZA", {
            month: "short",
            day: "numeric",
            timeZone: "Africa/Johannesburg",
          }).format(new Date(t))
        : "";
      lines.push({
        t,
        text: `${day} – Invoice finalized (${formatZarFromCents(finalizeTotal)})`,
      });
    }

    for (const item of rollingArr) {
      const ev = asRecord(item);
      if (!ev) continue;
      const line = eventLine(ev);
      if (line) {
        lines.push({ t: parseIso(ev.at) || 0, text: line });
      }
    }
  }

  lines.sort((a, b) => a.t - b.t || a.text.localeCompare(b.text));
  return lines.map((x) => x.text);
}
