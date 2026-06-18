/**
 * Client-safe helpers for admin booking pricing display.
 * (Avoid importing `priceSnapshotBooking.ts` from client components — it is `server-only`.)
 */

export type AdminPriceSnapshotCardView = {
  v: 1;
  service_type: string;
  base_price: number;
  extras: { id: string; name: string; price: number }[];
  total_price: number;
};

function finiteZar(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function versionIsCheckoutV1(v: unknown): boolean {
  if (v === 1) return true;
  if (typeof v === "string" && v.trim() === "1") return true;
  const n = Number(v);
  return Number.isFinite(n) && Math.round(n) === 1;
}

function currencyIsZar(v: unknown): boolean {
  const s = typeof v === "string" ? v.trim().toUpperCase() : String(v ?? "").trim().toUpperCase();
  return s === "ZAR";
}

function isCheckoutPriceSnapshotLoose(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const r = o as Record<string, unknown>;
  if (!versionIsCheckoutV1(r.version)) return false;
  if (!currencyIsZar(r.currency)) return false;
  return finiteZar(r.total_zar) != null && finiteZar(r.subtotal_zar) != null && finiteZar(r.visit_total_zar) != null;
}

function parseLegacyPriceSnapshotV1(raw: unknown): AdminPriceSnapshotCardView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const service_type = typeof o.service_type === "string" ? o.service_type : "";
  const base_price = typeof o.base_price === "number" && Number.isFinite(o.base_price) ? Math.round(o.base_price) : NaN;
  const total_price = typeof o.total_price === "number" && Number.isFinite(o.total_price) ? Math.round(o.total_price) : NaN;
  if (!service_type || !Number.isFinite(base_price) || !Number.isFinite(total_price)) return null;
  const extrasRaw = Array.isArray(o.extras) ? o.extras : [];
  const extras: { id: string; name: string; price: number }[] = [];
  for (const x of extrasRaw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const e = x as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : "";
    const name = typeof e.name === "string" ? e.name : id || "Extra";
    const price = typeof e.price === "number" && Number.isFinite(e.price) ? Math.round(e.price) : 0;
    extras.push({ id: id || "extra", name, price });
  }
  return { v: 1, service_type, base_price, extras, total_price };
}

export function inferAdminServiceTypeSlug(serviceSlug: string | null, serviceLabel: string | null): string {
  const ss = typeof serviceSlug === "string" ? serviceSlug.trim().toLowerCase() : "";
  if (ss === "quick") return "standard";
  if (ss) return ss;
  const lab = typeof serviceLabel === "string" ? serviceLabel.trim().toLowerCase() : "";
  if (lab.includes("quick")) return "standard";
  const keywords = ["standard", "airbnb", "deep", "carpet", "move"] as const;
  for (const k of keywords) {
    if (lab.includes(k)) return k;
  }
  if (!lab) return "standard";
  const slugish = lab
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slugish || "standard";
}

/**
 * Normalize `bookings.price_snapshot` for the admin “Pricing snapshot” card.
 * Supports legacy {@link PriceSnapshotV1} (`v: 1`) and checkout snapshots (`version: 1`, `currency: ZAR`).
 */
export function parseAdminBookingPriceSnapshot(
  raw: unknown,
  ctx: { serviceSlug: string | null; serviceLabel: string | null },
): AdminPriceSnapshotCardView | null {
  const legacy = parseLegacyPriceSnapshotV1(raw);
  if (legacy) return legacy;

  if (!isCheckoutPriceSnapshotLoose(raw)) return null;
  const c = raw as Record<string, unknown>;
  const visitTotal = finiteZar(c.visit_total_zar);
  const subtotal = finiteZar(c.subtotal_zar);
  const extrasTotal = finiteZar(c.extras_total_zar);
  const totalVisit =
    visitTotal != null && Number.isFinite(visitTotal) ? Math.round(visitTotal) : Math.round(finiteZar(c.total_zar) ?? 0);

  const lineItemsRaw = Array.isArray(c.line_items) ? c.line_items : [];
  type Line = { id: string; name: string; amount_zar: number };
  const lines: Line[] = [];
  for (const row of lineItemsRaw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : String(r.item_type ?? "line").trim() || "line";
    const name = typeof r.name === "string" ? r.name.trim() : "Line";
    const az = finiteZar(r.amount_zar);
    if (az == null || !Number.isFinite(az)) continue;
    lines.push({ id: id || "line", name: name || "Line", amount_zar: Math.round(az) });
  }

  let baseFromLines = 0;
  const extrasFromLines: { id: string; name: string; price: number }[] = [];
  for (const li of lines) {
    const n = li.name;
    if (n === "Service base" || n === "Rooms, bathrooms & duration") {
      baseFromLines += li.amount_zar;
      continue;
    }
    if (n.startsWith("Add-ons")) {
      extrasFromLines.push({ id: li.id || "addons", name: n, price: li.amount_zar });
      continue;
    }
  }

  let base_price =
    baseFromLines > 0
      ? baseFromLines
      : subtotal != null && extrasTotal != null
        ? Math.max(0, Math.round(subtotal - extrasTotal))
        : NaN;

  let extras = [...extrasFromLines];
  if (extras.length === 0 && extrasTotal != null && extrasTotal > 0) {
    extras = [{ id: "addons-subtotal", name: "Add-ons (subtotal)", price: Math.round(extrasTotal) }];
  }

  if (!Number.isFinite(base_price)) {
    base_price =
      subtotal != null && extrasTotal != null ? Math.max(0, Math.round(subtotal - extrasTotal)) : Math.max(0, totalVisit);
  }

  const service_type = inferAdminServiceTypeSlug(ctx.serviceSlug, ctx.serviceLabel);

  return {
    v: 1,
    service_type,
    base_price: Math.round(base_price),
    extras,
    total_price: totalVisit,
  };
}

function readPriceBreakdownExtrasZar(pb: unknown): number | null {
  if (!pb || typeof pb !== "object" || Array.isArray(pb)) return null;
  const o = pb as Record<string, unknown>;
  const job = o.job;
  if (job && typeof job === "object" && !Array.isArray(job)) {
    const ez = (job as { extrasZar?: unknown }).extrasZar;
    if (typeof ez === "number" && Number.isFinite(ez)) return Math.round(ez);
  }
  const top = o.extrasZar;
  if (typeof top === "number" && Number.isFinite(top)) return Math.round(top);
  return null;
}

/** Admin visit pricing split from persisted checkout snapshot / booking columns (not estimates). */
export function adminBookingVisitPricingSplit(booking: {
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  total_price?: number | null;
  base_amount_cents?: number | null;
  price_snapshot?: unknown;
  price_breakdown?: unknown;
  service?: string | null;
  service_slug?: string | null;
}): { basePrice: number; extrasPrice: number; total: number } {
  const total =
    typeof booking.total_price === "number" && Number.isFinite(booking.total_price) && booking.total_price > 0
      ? Math.round(booking.total_price)
      : typeof booking.total_paid_zar === "number" && Number.isFinite(booking.total_paid_zar) && booking.total_paid_zar > 0
        ? Math.round(booking.total_paid_zar)
        : Math.round((booking.amount_paid_cents ?? 0) / 100);

  const snap = parseAdminBookingPriceSnapshot(booking.price_snapshot, {
    serviceSlug: typeof booking.service_slug === "string" ? booking.service_slug : null,
    serviceLabel: typeof booking.service === "string" ? booking.service : null,
  });
  if (snap) {
    const extrasFromSnap = snap.extras.reduce((sum, row) => sum + row.price, 0);
    const visitTotal = snap.total_price > 0 ? snap.total_price : total;
    const extrasPrice =
      extrasFromSnap > 0 ? extrasFromSnap : Math.max(0, visitTotal - snap.base_price);
    return { basePrice: snap.base_price, extrasPrice, total: visitTotal };
  }

  const baseFromCents =
    typeof booking.base_amount_cents === "number" && Number.isFinite(booking.base_amount_cents)
      ? Math.round(booking.base_amount_cents / 100)
      : null;
  const extrasFromBreakdown = readPriceBreakdownExtrasZar(booking.price_breakdown);

  if (baseFromCents != null) {
    return {
      basePrice: baseFromCents,
      extrasPrice: extrasFromBreakdown ?? Math.max(0, total - baseFromCents),
      total,
    };
  }

  if (extrasFromBreakdown != null) {
    return {
      basePrice: Math.max(0, total - extrasFromBreakdown),
      extrasPrice: extrasFromBreakdown,
      total,
    };
  }

  return { basePrice: total, extrasPrice: 0, total };
}
