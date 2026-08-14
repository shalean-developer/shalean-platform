"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleDollarSign, MapPin, ReceiptText, ShieldAlert, Sparkles, Users } from "lucide-react";
import { getAdminToken } from "@/hooks/useAdminData";

type Booking = Record<string, unknown> & {
  id: string;
  service?: string | null;
  service_slug?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  suburb?: string | null;
  payment_status?: string | null;
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  total_paid_zar?: number | null;
  total_price?: number | string | null;
  duration_minutes?: number | null;
  duration_hours?: number | string | null;
  estimated_duration_minutes?: number | null;
  pricing_summary?: unknown;
  price_breakdown?: unknown;
  price_snapshot?: unknown;
  selected_extras?: unknown;
  extras?: unknown;
  service_details?: unknown;
  booking_snapshot?: unknown;
  access_instructions?: string | null;
  parking_instructions?: string | null;
  gate_code?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
  team_member_count_snapshot?: number | null;
  earnings_summary?: unknown;
  cleaner_earnings_total_cents?: number | null;
  zoho_invoice_number?: string | null;
};

type RosterRow = {
  cleaner_id: string;
  name: string;
  role: string;
  rating: number | null;
  jobs_completed: number | null;
  earning_cents: number | null;
};

type PaymentRow = {
  gateway?: string | null;
  amount_cents?: number | null;
  processing_fee_cents?: number | null;
  net_settlement_cents?: number | null;
  payment_channel?: string | null;
  settlement_status?: string | null;
  fee_calculation_method?: string | null;
};

type ApiResponse = { booking?: Booking; roster?: RosterRow[]; payment?: PaymentRow | null; error?: string };
type PriceLine = { label: string; amountZar: number | null };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeCents(value: unknown): number {
  return Math.max(0, Math.round(num(value) ?? 0));
}

function zarFromCents(value: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
}

function zar(value: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function serviceLabel(value: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "Service not set";
  if (normalized === "deep" || normalized === "deep-cleaning") return "Deep Cleaning";
  if (normalized === "move" || normalized.includes("move-in") || normalized.includes("move_out")) return "Move In / Out Cleaning";
  return normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function collectedCents(booking: Booking): number {
  const stored = num(booking.total_paid_cents) ?? num(booking.amount_paid_cents);
  if (stored != null && stored > 0) return Math.round(stored);
  const major = num(booking.total_paid_zar);
  return major != null && major > 0 ? Math.round(major * 100) : 0;
}

function isSettled(booking: Booking, payment: PaymentRow | null): boolean {
  if (collectedCents(booking) > 0 || nonNegativeCents(payment?.amount_cents) > 0) return true;
  const bookingStatus = String(booking.payment_status ?? "").trim().toLowerCase();
  const settlementStatus = String(payment?.settlement_status ?? "").trim().toLowerCase();
  const channel = String(payment?.payment_channel ?? "").trim().toLowerCase();
  return ["paid", "success", "completed", "settled"].includes(bookingStatus) || settlementStatus === "settled" || channel === "promo_credit_cover";
}

function duration(booking: Booking): string {
  const mins = num(booking.duration_minutes) ?? num(booking.estimated_duration_minutes);
  const resolved = mins && mins > 0 ? Math.round(mins) : Math.round((num(booking.duration_hours) ?? 0) * 60);
  if (!resolved) return "Duration not set";
  const h = Math.floor(resolved / 60);
  const m = resolved % 60;
  return m ? `${h}h ${m}m` : `${h} hours`;
}

function address(booking: Booking): string {
  const snapshot = record(booking.booking_snapshot);
  const parts = [text(booking.location), text(booking.suburb) ?? text(snapshot?.suburb), text(snapshot?.city)].filter((v): v is string => Boolean(v));
  return [...new Set(parts)].join(", ") || "Address not set";
}

function instructionData(booking: Booking) {
  const details = record(booking.service_details);
  const snapshot = record(booking.booking_snapshot);
  const snapshotDetails = record(snapshot?.serviceDetails ?? snapshot?.service_details);
  const pets = text(details?.hasPets) ?? text(snapshotDetails?.hasPets);
  return {
    special: text(details?.specialInstructions) ?? text(details?.special_instructions) ?? text(snapshotDetails?.specialInstructions) ?? text(snapshot?.customer_notes),
    access: text(booking.access_instructions) ?? text(snapshot?.accessInstructions),
    parking: text(booking.parking_instructions) ?? text(snapshot?.parkingInstructions),
    gate: text(booking.gate_code) ?? text(snapshot?.gateCode),
    pets: pets ? (pets.toLowerCase() === "yes" ? "Yes" : pets) : null,
  };
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()).trim();
}

function pricing(booking: Booking): { originalTotal: number | null; discount: number; lines: PriceLine[]; extras: PriceLine[] } {
  const summary = record(booking.pricing_summary);
  const snapshot = record(booking.booking_snapshot);
  const source = summary ?? record(snapshot?.pricingSummary);
  const lines = (Array.isArray(source?.lineItems) ? source.lineItems : []).map((raw): PriceLine | null => {
    const row = record(raw);
    const label = text(row?.label);
    return label ? { label, amountZar: num(row?.amountZar) ?? num(row?.amount_zar) } : null;
  }).filter((row): row is PriceLine => Boolean(row));

  const priceSnapshot = record(booking.price_snapshot);
  const candidates: unknown[] = [];
  for (const value of [source?.selected_extras, priceSnapshot?.extras, booking.extras, booking.selected_extras]) if (Array.isArray(value)) candidates.push(...value);
  const extras = new Map<string, PriceLine>();
  for (const raw of candidates) {
    const row = record(raw);
    const rawLabel = typeof raw === "string" ? raw : text(row?.name) ?? text(row?.label) ?? text(row?.id);
    if (!rawLabel) continue;
    const label = humanize(rawLabel);
    const amount = row ? num(row.total) ?? num(row.price) ?? num(row.amountZar) ?? num(row.amount_zar) : lines.find((line) => line.label.toLowerCase() === label.toLowerCase())?.amountZar ?? null;
    const key = label.toLowerCase();
    const existing = extras.get(key);
    if (!existing || (existing.amountZar == null && amount != null)) extras.set(key, { label, amountZar: amount });
  }

  const promotion = record(snapshot?.promotionCheckout);
  const referral = record(snapshot?.referralCheckout);
  const aggregate = num(priceSnapshot?.discount_zar);
  const detailed = (num(priceSnapshot?.promotion_discount_zar) ?? 0) + (num(priceSnapshot?.referral_discount_zar) ?? 0) + (num(priceSnapshot?.cleaning_credit_zar) ?? 0);
  const checkout = (num(promotion?.totalDiscountZar) ?? 0) + (num(referral?.discountZar) ?? 0);
  const legacy = num(record(booking.price_breakdown)?.discountZar) ?? 0;
  const discount = Math.max(0, aggregate ?? (detailed > 0 ? detailed : checkout || legacy));
  const quoted = num(source?.total) ?? num(source?.estimated_total);
  const payable = num(booking.total_price);
  return { originalTotal: quoted ?? (payable != null ? payable + discount : null), discount, lines, extras: [...extras.values()] };
}

function earningsCents(booking: Booking, roster: RosterRow[]): number {
  const summary = record(booking.earnings_summary);
  const fromSummary = num(summary?.total_cleaner_earnings_cents);
  const rosterTotal = roster.reduce((sum, row) => sum + nonNegativeCents(row.earning_cents), 0);
  return Math.max(0, Math.round(fromSummary ?? num(booking.cleaner_earnings_total_cents) ?? rosterTotal));
}

export function OfficeBookingOperationalDashboard({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const token = (await getAdminToken()) ?? undefined;
        if (!token) return;
        const response = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/operational-summary`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const json = (await response.json().catch(() => ({}))) as ApiResponse;
        if (!controller.signal.aborted) setData(response.ok ? json : { error: json.error ?? "Unable to load booking summary." });
      } catch {
        if (!controller.signal.aborted) setData({ error: "Unable to load booking summary." });
      }
    })();
    return () => controller.abort();
  }, [bookingId]);

  const booking = data?.booking;
  const roster = data?.roster ?? [];
  const payment = data?.payment ?? null;
  const price = useMemo(() => (booking ? pricing(booking) : null), [booking]);
  const notes = useMemo(() => (booking ? instructionData(booking) : null), [booking]);

  if (!data) return <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
  if (!booking || data.error) return null;

  const service = serviceLabel(text(booking.service) ?? text(booking.service_slug));
  const teamJob = booking.is_team_job === true || Boolean(booking.team_id) || roster.length > 1;
  const lead = roster.find((row) => row.role.toLowerCase() === "lead") ?? roster[0] ?? null;
  const earnings = earningsCents(booking, roster);
  const paidCents = nonNegativeCents(payment?.amount_cents) || collectedCents(booking);
  const gatewayFeeCents = payment ? nonNegativeCents(payment.processing_fee_cents) : 0;
  const netReceivedCents = payment && num(payment.net_settlement_cents) != null ? Math.round(num(payment.net_settlement_cents) ?? 0) : paidCents - gatewayFeeCents;
  const settled = isSettled(booking, payment);
  // Keep the signed result: a negative margin is operationally important and must not be hidden.
  const marginCents = settled ? netReceivedCents - earnings : null;
  const gateway = text(payment?.gateway)?.toLowerCase();
  const feeLabel = gateway === "paystack" ? "Paystack fee" : gateway ? `${gateway.toUpperCase()} fee` : "Gateway fee";
  const hasNotes = Boolean(notes?.special || notes?.access || notes?.parking || notes?.gate || notes?.pets);
  const paymentDisplay = paidCents > 0 ? zarFromCents(paidCents) : settled ? "R 0.00 (settled)" : "Not collected";

  return (
    <div className="space-y-4">
      {hasNotes && notes ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div className="min-w-0 flex-1">
            <h2 className="font-semibold text-amber-950">Customer instructions — read before service</h2>
            {notes.special ? <p className="mt-2 rounded-xl border border-amber-200 bg-white/80 p-3 text-sm leading-relaxed text-slate-900">{notes.special}</p> : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {notes.access ? <Instruction label="Access" value={notes.access} /> : null}{notes.parking ? <Instruction label="Parking" value={notes.parking} /> : null}{notes.gate ? <Instruction label="Gate / access" value={notes.gate} /> : null}{notes.pets ? <Instruction label="Pets" value={notes.pets} /> : null}
            </div>
          </div></div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Booking operational summary</h2><p className="text-sm text-slate-500">One source of truth for service, team, location and profitability.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{service}</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Fact icon={ReceiptText} label="Service" value={service} detail={duration(booking)} /><Fact icon={CalendarClock} label="Schedule" value={`${String(booking.date ?? "Date not set")} · ${String(booking.time ?? "Time not set")}`} detail="Customer service time" /><Fact icon={MapPin} label="Full location" value={address(booking)} detail="Field operations address" /><Fact icon={Users} label={teamJob ? "Assigned team" : "Assigned cleaner"} value={teamJob ? `${roster.length || num(booking.team_member_count_snapshot) || 0} cleaners` : lead?.name ?? "Not assigned"} detail={lead ? `${lead.name}${lead.role.toLowerCase() === "lead" ? " · Team Leader" : ""}` : "No cleaner assigned"} /></div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" /><h3 className="font-semibold text-slate-950">{teamJob ? "Team roster" : "Cleaner assignment"}</h3></div><div className="overflow-hidden rounded-xl border border-slate-200">{roster.length ? roster.map((row, index) => <div key={row.cleaner_id} className={`flex items-center justify-between gap-3 px-3 py-3 ${index ? "border-t border-slate-100" : ""}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{row.name}</span>{row.role.toLowerCase() === "lead" ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">Team Leader</span> : null}</div><p className="text-xs text-slate-500">{row.rating != null ? `${row.rating.toFixed(1)} rating` : "Rating unavailable"}{row.jobs_completed != null ? ` · ${row.jobs_completed} jobs completed` : ""}</p></div><span className="font-bold text-slate-900">{row.earning_cents != null ? zarFromCents(row.earning_cents) : "Pending"}</span></div>) : <p className="p-3 text-sm text-slate-500">No cleaner assigned.</p>}</div></section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-emerald-700" /><h3 className="font-semibold text-slate-950">Payment & profitability</h3></div><MoneyRow label="Customer paid" value={paymentDisplay} strong />{settled ? <MoneyRow label={feeLabel} value={gatewayFeeCents > 0 ? `− ${zarFromCents(gatewayFeeCents)}` : zarFromCents(0)} /> : null}{settled ? <MoneyRow label="Net received by Shalean" value={zarFromCents(netReceivedCents)} /> : null}<MoneyRow label={teamJob ? "Team earnings" : "Cleaner earnings"} value={`− ${zarFromCents(earnings)}`} /><MoneyRow label="Shalean gross margin" value={marginCents != null ? zarFromCents(marginCents) : "Available after payment"} strong accent={marginCents != null && marginCents >= 0} negative={marginCents != null && marginCents < 0} />{payment?.fee_calculation_method ? <p className="mt-3 text-xs text-slate-500">Fee source: {payment.fee_calculation_method === "paystack_reported" ? "Paystack reported" : payment.fee_calculation_method}</p> : null}{booking.zoho_invoice_number ? <p className="mt-1 text-xs text-slate-500">Zoho invoice: <span className="font-semibold">{booking.zoho_invoice_number}</span></p> : null}</section>
      </div>

      {price ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-blue-600" /><h3 className="font-semibold text-slate-950">Pricing breakdown</h3></div><div className="text-right">{price.originalTotal != null ? <p className="text-xs text-slate-500">Original quote {zar(price.originalTotal)}</p> : null}<p className={`text-lg font-bold ${settled ? "text-emerald-700" : "text-amber-700"}`}>{paidCents > 0 ? `Paid ${zarFromCents(paidCents)}` : settled ? "Settled at R0" : "Payment not collected"}</p></div></div><div className="grid gap-4 lg:grid-cols-[1fr_300px]"><div className="overflow-hidden rounded-xl border border-slate-200">{price.lines.length ? price.lines.map((line, index) => <div key={`${line.label}-${index}`} className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm ${index ? "border-t border-slate-100" : ""}`}><span>{line.label}</span><strong>{line.amountZar != null ? zar(line.amountZar) : "—"}</strong></div>) : <p className="p-3 text-sm text-slate-500">No structured pricing lines recorded.</p>}</div><div className="rounded-xl bg-slate-50 p-3">{price.originalTotal != null ? <MoneyRow label="Original total" value={zar(price.originalTotal)} /> : null}{price.discount > 0 ? <MoneyRow label="Discounts / credits" value={`− ${zar(price.discount)}`} /> : null}<MoneyRow label="Customer paid" value={paymentDisplay} strong /><div className="mt-3 border-t border-slate-200 pt-3"><div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Sparkles className="h-3.5 w-3.5" />Extras</div>{price.extras.length ? price.extras.map((extra) => <p key={extra.label} className="mt-1 flex justify-between gap-2 text-sm"><span>{extra.label}</span><strong>{extra.amountZar != null ? zar(extra.amountZar) : "Selected"}</strong></p>) : <p className="mt-1 text-sm text-slate-500">No extras recorded</p>}</div></div></div></section> : null}
    </div>
  );
}

function Instruction({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2.5"><p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{label}</p><p className="mt-1 text-sm font-medium text-slate-900">{value}</p></div>;
}

function Fact({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</div><p className="mt-1 break-words font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

function MoneyRow({ label, value, strong, accent, negative }: { label: string; value: string; strong?: boolean; accent?: boolean; negative?: boolean }) {
  const tone = negative ? "text-red-700" : accent ? "text-emerald-700" : "text-slate-950";
  return <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 py-2 last:border-0"><span className="text-sm text-slate-600">{label}</span><span className={`${strong ? "text-base font-bold" : "text-sm font-semibold"} ${tone}`}>{value}</span></div>;
}
