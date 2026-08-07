import { adminBookingAssignmentDisplay } from "@/lib/admin/adminBookingAssignmentDisplay";
import { rowsToCsv } from "@/lib/admin/csvExport";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

export type OfficeBookingsExportRow = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service: string | null;
  service_slug: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  status: string | null;
  team_id?: string | null;
  team?: { id: string; name: string | null } | null;
  booking_cleaners?: Array<{ cleaner_id: string; full_name: string | null; role: string }>;
};

const CSV_HEADERS = [
  "id",
  "customer_name",
  "customer_email",
  "service",
  "date",
  "time",
  "location",
  "assignment",
  "amount_zar",
  "status",
] as const;

function formatExportAmountZar(cents: number | null | undefined, zar: number | null | undefined): string {
  const val = zar ?? (cents != null ? cents / 100 : null);
  if (val == null) return "";
  return String(Math.round(val));
}

export function buildOfficeBookingsListCsv(rows: readonly OfficeBookingsExportRow[]): string {
  const data = rows.map((b) => ({
    id: b.id,
    customer_name: b.customer_name ?? "",
    customer_email: b.customer_email ?? "",
    service: (b.service_slug ?? b.service ?? "").replace(/-/g, " "),
    date: b.date ?? "",
    time: b.time ? b.time.slice(0, 5) : "",
    location: b.location ?? "",
    assignment: adminBookingAssignmentDisplay(b).label,
    amount_zar: formatExportAmountZar(b.amount_paid_cents, b.total_paid_zar),
    status: b.status ?? "",
  }));
  return rowsToCsv([...CSV_HEADERS], data);
}

export function downloadOfficeBookingsCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type ExportApiResponse = {
  bookings?: OfficeBookingsExportRow[];
  error?: string;
};

/**
 * Fetch export-safe booking rows through the dedicated permission-gated export
 * endpoint. The server preserves branch/team scope, strips unauthorized finance
 * fields, enforces bulk-export approval, and records the export audit event.
 */
export async function fetchAllOfficeBookingsForExport(
  params: Record<string, string>,
): Promise<OfficeBookingsExportRow[]> {
  const token = (await getSupabaseAccessToken()) ?? undefined;
  if (!token) throw new Error("Not authenticated");

  const query = new URLSearchParams({ ...params, format: "json" });
  const res = await globalThis.fetch(`/api/admin/bookings/export?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as ExportApiResponse;
  if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
  return json.bookings ?? [];
}
