"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  FileText,
  House,
  MapPin,
  PawPrint,
  ReceiptText,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";
import { getAdminToken } from "@/hooks/useAdminData";

type SummaryBooking = Record<string, unknown> & {
  id: string;
  booking_reference?: string | null;
  service?: string | null;
  service_slug?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  suburb?: string | null;
  status?: string | null;
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
  company_revenue_cents?: number | null;
  display_earnings_cents?: number | null;
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

type ApiResponse = { booking?: SummaryBooking; roster?: RosterRow[]; error?: string };

type PriceLine = { label: string; amountZar: number };

type CustomerInstruction = { label: string; value: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v || null;
}

function numberOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function moneyZar(value: number): string {
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}

function centsZar(value: number | null | undefined): string {
  return moneyZar((Number(value) || 0) / 100);
}

function titleCaseService(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Service not set";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .replace(/^Deep$/i, "Deep Cleaning")
    .replace(/^Move$/i, "Move In / Out Cleaning");
}

function bookingTotalZar(booking: SummaryBooking): number {
  const cents = numberOrNull(booking.total_paid_cents) ?? numberOrNull(booking.amount_paid_cents);
  if (cents != null && cents > 0) return cents / 100;
  const paid = numberOrNull(booking.total_paid_zar);
  if (paid != null && paid > 0) return paid;
  return numberOrNull(booking.total_price) ?? 0;
}

function bookingDurationMinutes(booking: SummaryBooking): number | null {
  const minutes = numberOrNull(booking.duration_minutes) ?? numberOrNull(booking.estimated_duration_minutes);
  if (minutes != null && minutes > 0) return Math.round(minutes);
  const hours = numberOrNull(booking.duration_hours);
  return hours != null && hours > 0 ? Math.round(hours * 60) : null;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return "Not set";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h} hours`;
}

function fullAddress(booking: SummaryBooking): string {
  const snapshot = asRecord(booking.booking_snapshot);
  const parts = [
    cleanText(booking.location),
    cleanText(booking.suburb) ?? cleanText(snapshot?.suburb),
    cleanText(snapshot?.city),
  ].filter((v): v is string => Boolean(v));
  return [...new Set(parts)].join(", ") || "Address not set";
}

function extractInstructions(booking: SummaryBooking): { special: string | null; items: CustomerInstruction[] } {
  const serviceDetails = asRecord(booking.service_details);
  const snapshot = asRecord(booking.booking_snapshot);
  const snapshotService = asRecord(snapshot?.serviceDetails ?? snapshot?.service_details);
  const special =
    cleanText(serviceDetails?.specialInstructions) ??
    cleanText(serviceDetails?.special_instructions) ??
    cleanText(snapshotService?.specialInstructions) ??
    cleanText(snapshotService?.special_instructions) ??
    cleanText(snapshot?.customer_notes);

  const items: CustomerInstruction[] = [];
  const access = cleanText(booking.access_instructions) ?? cleanText(snapshot?.accessInstructions) ?? cleanText(snapshot?.access_instructions);
  const parking = cleanText(booking.parking_instructions) ?? cleanText(snapshot?.parkingInstructions) ?? cleanText(snapshot?.parking_instructions);
  const gate = cleanText(booking.gate_code) ?? cleanText(snapshot?.gateCode) ?? cleanText(snapshot?.gate_code);
  const petsRaw =
    cleanText(serviceDetails?.hasPets) ?? cleanText(serviceDetails?.has_pets) ?? cleanText(snapshotService?.hasPets) ?? cleanText(snapshotService?.has_pets);
  if (access) items.push({ label: "Access", value: access });
  if (parking) items.push({ label: "Parking", value: parking });
  if (gate) items.push({ label: "Gate / access code", value: gate });
  if (petsRaw) items.push({ label: "Pets", value: petsRaw.toLowerCase() === "yes" ? "Yes" : petsRaw });
  return { special, items };
}

function extractPricing(booking: SummaryBooking): {
  originalTotal: number | null;
  discount: number;
  paidTotal: number;
  lines: PriceLine[];
  extras: PriceLine[];
} {
  const pricing = asRecord(booking.pricing_summary);
  const snapshot = asRecord(booking.booking_snapshot);
  const snapshotPricing = asRecord(snapshot?.pricingSummary);
  const source = pricing ?? snapshotPricing;
  const rawLines = Array.isArray(source?.lineItems) ? source?.lineItems : [];
  const lines = (rawLines as unknown[])
    .map((item): PriceLine | null => {
      const row = asRecord(item);
      const label = cleanText(row?.label);
      const amount = numberOrNull(row?.amountZar);
      return label && amount != null ? { label, amountZar: amount } : null;
    })
    .filter((v): v is PriceLine => Boolean(v));
  const rawExtras = Array.isArray(source?.selected_extras) ? source?.selected_extras : [];
  const extras = (rawExtras as unknown[])
    .map((item): PriceLine | null => {
      const row = asRecord(item);
      const label = cleanText(row?.name) ?? cleanText(row?.label);
      const amount = numberOrNull(row?.total) ?? numberOrNull(row?.price);
      return label && amount != null ? { label, amountZar: amount } : null;
    })
    .filter((v): v is PriceLine => Boolean(v));

  const promo = asRecord(snapshot?.promotionCheckout);
  const discount = numberOrNull(promo?.totalDiscountZar) ?? numberOrNull(asRecord(booking.price_breakdown)?.discountZar) ?? 0;
  const originalTotal = numberOrNull(source?.total) ?? numberOrNull(source?.estimated_total);
  return { originalTotal, discount, paidTotal: bookingTotalZar(booking), lines, extras };
}

function extractTeamEarnings(booking: SummaryBooking, roster: RosterRow[]): { totalCents: number; marginCents: number } {
  const earnings = asRecord(booking.earnings_summary);
  const fromSummary = numberOrNull(earnings?.total_cleaner_earnings_cents);
  const rosterTotal = roster.reduce((sum, row) => sum + (numberOrNull(row.earning_cents) ?? 0), 0);
  const totalCents = Math.max(0, Math.round(fromSummary ?? numberOrNull(booking.cleaner_earnings_total_cents) ?? rosterTotal));
  const paidCents = Math.round(bookingTotalZar(booking) * 100);
  const storedMargin = numberOrNull(booking.company_revenue_cents);
  return { totalCents, marginCents: Math.max(0, Math.round(storedMargin ?? paidCents - totalCents)) };
}

export function OfficeBookingOperationalSummary({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) return;
    const ac = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        const token = (await getAdminToken()) ?? undefined;
        if (!token || ac.signal.aborted) return;
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/operational-summary`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });
        const json = (await res.json().catch(() => ({}))) as ApiResponse;
        if (!ac.signal.aborted) setData(res.ok ? json : { error: json.error ?? "Could not load operational summary." });
      } catch {
        if (!ac.signal.aborted) setData({ error: "Could not load operational summary." });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [bookingId]);

  const booking = data?.booking ?? null;
  const roster = data?.roster ?? [];
  const instructions = useMemo(() => (booking ? extractInstructions(booking) : null), [booking]);
  const pricing = useMemo(() => (booking ? extractPricing(booking) : null), [booking]);
  const financials = useMemo(() => (booking ? extractTeamEarnings(booking, roster) : null), [booking, roster]);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" aria-label="Loading booking operational summary" />;
  }
  if (!booking || data?.error) return null;

  const durationMinutes = bookingDurationMinutes(booking);
  const serviceName = titleCaseService(cleanText(booking.service) ?? cleanText(booking.service_slug));
  const teamJob = booking.is_team_job === true || Boolean(booking.team_id) || roster.length > 1;
  const teamCount = roster.length || numberOrNull(booking.team_member_count_snapshot) || (teamJob ? 1 : 0);
  const leader = roster.find((row) => row.role.toLowerCase() === "lead") ?? roster[0] ?? null;
  const hasInstructions = Boolean(instructions?.special || instructions?.items.length);

  return (
    <section className="space-y-4" aria-label="Canonical booking operational summary">
      {hasInstructions && instructions ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-950">Customer instructions — read before service</p>
              <p className="text-xs text-amber-800">Operational instructions supplied by the customer.</p>
              {instructions.special ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Special cleaning instructions</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">{instructions.special}</p>
                </div>
              ) : null}
              {instructions.items.length ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {instructions.items.map((item) => (
                    <div key={item.label} className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{item.label}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-950">Operational summary</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Canonical service, team, pricing and location data for this booking.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{serviceName}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TruthCard icon={House} label="Service" value={serviceName} detail={formatDuration(durationMinutes)} />
          <TruthCard icon={CalendarClock} label="Schedule" value={`${String(booking.date ?? "Date not set")} · ${String(booking.time ?? "Time not set")}`} detail="Customer/service estimate" />
          <TruthCard icon={MapPin} label="Full location" value={fullAddress(booking)} detail="Use this address for field operations" />
          <TruthCard
            icon={Users}
            label={teamJob ? "Assigned team" : "Assigned cleaner"}
            value={teamJob ? `${teamCount} cleaner${teamCount === 1 ? "" : "s"}` : leader?.name ?? "Not assigned"}
            detail={leader ? `${leader.name}${leader.role.toLowerCase() === "lead" ? " · Team Leader" : ""}` : "Roster not loaded"}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-slate-950">Team roster & earnings</h3>
          </div>
          {roster.length ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              {roster.map((row, index) => (
                <div key={row.cleaner_id} className={`flex items-center justify-between gap-3 px-3 py-3 ${index ? "border-t border-slate-100" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{row.name}</p>
                      {row.role.toLowerCase() === "lead" ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">Team Leader</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Member</span>}
                    </div>
                    <p className="text-xs text-slate-500">{row.rating != null ? `${row.rating.toFixed(1)} rating` : "Rating unavailable"}{row.jobs_completed != null ? ` · ${row.jobs_completed} jobs completed` : ""}</p>
                  </div>
                  <p className="shrink-0 font-bold text-slate-900">{row.earning_cents != null ? centsZar(row.earning_cents) : "Pending"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No roster rows recorded for this booking.</p>
          )}
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-emerald-700" />
            <h3 className="font-semibold text-slate-950">Payment & margin</h3>
          </div>
          <div className="mt-3 grid gap-2">
            <MoneyRow label="Customer paid" value={moneyZar(bookingTotalZar(booking))} strong />
            <MoneyRow label={teamJob ? "Team earnings" : "Cleaner earnings"} value={centsZar(financials?.totalCents)} />
            <MoneyRow label="Shalean gross margin" value={centsZar(financials?.marginCents)} accent />
          </div>
          {booking.zoho_invoice_number ? <p className="mt-3 text-xs text-slate-500">Zoho invoice: <span className="font-semibold text-slate-700">{booking.zoho_invoice_number}</span></p> : null}
        </div>
      </div>

      {pricing ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-slate-950">Canonical pricing breakdown</h3>
            </div>
            <div className="text-right">
              {pricing.originalTotal != null && pricing.originalTotal > pricing.paidTotal ? <p className="text-xs text-slate-500">Original quote <span className="line-through">{moneyZar(pricing.originalTotal)}</span></p> : null}
              <p className="text-lg font-bold text-emerald-700">Paid {moneyZar(pricing.paidTotal)}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {pricing.lines.length ? pricing.lines.map((line, index) => (
                <div key={`${line.label}-${index}`} className={`flex items-center justify-between gap-3 px-3 py-2.5 text-sm ${index ? "border-t border-slate-100" : ""}`}>
                  <span className="text-slate-700">{line.label}</span>
                  <span className="font-semibold text-slate-900">{moneyZar(line.amountZar)}</span>
                </div>
              )) : <p className="px-3 py-3 text-sm text-slate-500">No structured pricing lines recorded.</p>}
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reconciliation</p>
              {pricing.originalTotal != null ? <MoneyRow label="Original total" value={moneyZar(pricing.originalTotal)} /> : null}
              {pricing.discount > 0 ? <MoneyRow label="Discount" value={`− ${moneyZar(pricing.discount)}`} /> : null}
              <MoneyRow label="Customer paid" value={moneyZar(pricing.paidTotal)} strong />
              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Sparkles className="h-3.5 w-3.5" /> Extras</div>
                {pricing.extras.length ? pricing.extras.map((extra) => <p key={extra.label} className="mt-1 flex justify-between gap-2 text-sm"><span>{extra.label}</span><span className="font-semibold">{moneyZar(extra.amountZar)}</span></p>) : <p className="mt-1 text-sm text-slate-500">No extras selected</p>}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p><span className="font-semibold text-slate-800">Internal staff notes:</span> customer instructions are shown separately above. The existing “Booking notes” area below is for internal/admin notes only.</p>
        </div>
      </div>
    </section>
  );
}

function TruthCard({ icon: Icon, label, value, detail }: { icon: typeof House; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className="mt-1 break-words font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function MoneyRow({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 py-2 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`${strong ? "text-base font-bold" : "text-sm font-semibold"} ${accent ? "text-emerald-700" : "text-slate-950"}`}>{value}</span>
    </div>
  );
}
