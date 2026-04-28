const TZ = "Africa/Johannesburg";

function addOneCalendarMonthYm(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd.slice(0, 7);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Mirrors DB `public.monthly_invoice_bucket_month` (last service day + same-day JHB after cutoff → next month).
 * Used for admin UI hints; server remains authoritative via trigger.
 */
export function previewInvoiceBucketMonth(params: {
  serviceDateYmd: string;
  createdAt?: Date;
  cutoffHour?: number;
}): string | null {
  const serviceDate = params.serviceDateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return null;
  const cutoff = typeof params.cutoffHour === "number" && Number.isFinite(params.cutoffHour) ? params.cutoffHour : 18;
  const createdAt = params.createdAt ?? new Date();

  const [y, m, d] = serviceDate.split("-").map(Number);
  const lastDom = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const isLastDay = d === lastDom;

  const jhbDate = createdAt.toLocaleDateString("en-CA", { timeZone: TZ });
  const jhbHour = Number(
    createdAt.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }),
  );

  if (isLastDay && jhbDate === serviceDate && Number.isFinite(jhbHour) && jhbHour >= cutoff) {
    return addOneCalendarMonthYm(serviceDate);
  }

  return serviceDate.slice(0, 7);
}

export function formatInvoiceMonthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, mo] = ym.split("-").map(Number);
  const dt = new Date(y, mo - 1, 1);
  return dt.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}
