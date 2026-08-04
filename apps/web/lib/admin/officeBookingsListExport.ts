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
  pagination?: { totalPages: number };
};

export async function fetchAllOfficeBookingsForExport(
  params: Record<string, string>,
): Promise<OfficeBookingsExportRow[]> {
  const token = (await getSupabaseAccessToken()) ?? undefined;
  if (!token) throw new Error("Not authenticated");

  const all: OfficeBookingsExportRow[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const query = new URLSearchParams({ ...params, page: String(page), pageSize: "100" });
    const res = await globalThis.fetch(`/api/admin/bookings/scoped?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? `Error ${res.status}`);
    }
    const json = (await res.json()) as ExportApiResponse;
    all.push(...(json.bookings ?? []));
    totalPages = Math.max(1, json.pagination?.totalPages ?? 1);
    page += 1;
  }

  return all;
}
