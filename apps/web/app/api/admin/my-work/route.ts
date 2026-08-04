import { NextResponse } from "next/server";
import { GET as getScopedBookings } from "@/app/api/admin/bookings/scoped/route";
import { GET as getCronHealth } from "@/app/api/admin/cron-health/route";
import { GET as getMyPermissions } from "@/app/api/admin/security/my-permissions/route";
import { requireAnyAdminPermissionFromRequest, type AdminPermission } from "@/lib/admin/requirePermission";
import { canReceiveOfficeWorkItem, sortOfficeWorkItems, type OfficeWorkItem } from "@/lib/admin/officeWorkItems";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTRY_PERMISSIONS: readonly AdminPermission[] = [
  "booking.view",
  "booking.assign",
  "ops.health.view",
  "system.logs",
  "finance.summary.view",
  "cleaner.view",
  "marketing.view",
];

type PermissionPayload = { permissions?: string[] };
type BookingRow = {
  id?: string;
  customer_name?: string | null;
  service?: string | null;
  service_slug?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  status?: string | null;
  team_id?: string | null;
  city_id?: string | null;
};
type BookingPayload = { bookings?: BookingRow[] };
type CronJob = { job_name?: string; last_success_at?: string | null; last_run_at?: string | null; last_run_status?: "success" | "error" | null; last_run_message?: string | null };
type CronPayload = { jobs?: CronJob[] };

async function jsonFrom<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  try { return (await response.json()) as T; } catch { return null; }
}

function derivedRequest(request: Request, pathname: string, search = ""): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = search;
  return new Request(url, { method: "GET", headers: request.headers, cache: "no-store" });
}

function cleanLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function shortReference(id: string): string {
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}

function bookingItems(rows: BookingRow[], permissions: ReadonlySet<string>): OfficeWorkItem[] {
  if (!permissions.has("booking.assign")) return [];
  const today = todayJohannesburg();
  return rows
    .filter((row) => row.id && !row.team_id && row.status !== "completed" && row.status !== "cancelled")
    .slice(0, 25)
    .map((row) => {
      const id = row.id as string;
      const overdue = Boolean(row.date && row.date < today);
      const service = cleanLabel(row.service_slug || row.service) || "Cleaning service";
      const customer = row.customer_name?.trim() || "Customer not recorded";
      const slot = [row.date, row.time?.slice(0, 5)].filter(Boolean).join(" · ");
      const location = row.location?.trim();
      const context = [service, customer, slot, location].filter(Boolean).join(" • ");
      return {
        id: `booking.assignment:${id}`,
        type: "booking.assignment",
        title: overdue ? `Overdue booking ${shortReference(id)} needs a team` : `Booking ${shortReference(id)} needs team allocation`,
        summary: context,
        priority: overdue ? "critical" : row.date === today ? "high" : "medium",
        status: overdue ? "overdue" : "open",
        href: `/office/bookings/${id}`,
        actionLabel: "Assign team",
        requiredPermission: "booking.assign",
        occurredAt: null,
        dueAt: row.date ? `${row.date}T${row.time?.slice(0, 8) || "06:00:00"}+02:00` : null,
        branchId: row.city_id ?? null,
        teamId: null,
      } satisfies OfficeWorkItem;
    });
}

function cronItems(jobs: CronJob[], permissions: ReadonlySet<string>): OfficeWorkItem[] {
  if (!permissions.has("ops.health.view")) return [];
  const now = Date.now();
  return jobs.flatMap((job) => {
    if (!job.job_name) return [];
    const last = job.last_success_at ? Date.parse(job.last_success_at) : 0;
    const stale = !last || now - last > 30 * 60_000;
    const failed = job.last_run_status === "error";
    if (!stale && !failed) return [];
    return [{
      id: `system.cron:${job.job_name}`,
      type: "system.cron",
      title: failed ? `${job.job_name} failed` : `${job.job_name} is stale`,
      summary: job.last_run_message || "The scheduled process needs operational review.",
      priority: failed ? "critical" : "high",
      status: failed ? "blocked" : "overdue",
      href: "/office/ops-health",
      actionLabel: "Review system health",
      requiredPermission: "ops.health.view",
      occurredAt: job.last_run_at ?? null,
      dueAt: null,
      branchId: null,
      teamId: null,
    } satisfies OfficeWorkItem];
  });
}

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ENTRY_PERMISSIONS);
  if (!auth.ok) return auth.response;

  const permissionPayload = await jsonFrom<PermissionPayload>(await getMyPermissions(derivedRequest(request, "/api/admin/security/my-permissions")));
  if (!permissionPayload) return NextResponse.json({ error: "Unable to resolve Office permissions." }, { status: 503 });

  const permissions = new Set(permissionPayload.permissions ?? []);
  const items: OfficeWorkItem[] = [];

  if (permissions.has("booking.view") || permissions.has("booking.assign")) {
    const bookingPayload = await jsonFrom<BookingPayload>(await getScopedBookings(derivedRequest(request, "/api/admin/bookings/scoped", "?page=1&pageSize=100")));
    if (bookingPayload?.bookings) items.push(...bookingItems(bookingPayload.bookings, permissions));
  }

  if (permissions.has("ops.health.view")) {
    const cronPayload = await jsonFrom<CronPayload>(await getCronHealth(derivedRequest(request, "/api/admin/cron-health")));
    if (cronPayload?.jobs) items.push(...cronItems(cronPayload.jobs, permissions));
  }

  const safeItems = sortOfficeWorkItems(items.filter((item) => canReceiveOfficeWorkItem(item, permissions))).slice(0, 30);
  const counts = safeItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.priority] = (acc[item.priority] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), items: safeItems, counts }, { headers: { "Cache-Control": "private, no-store" } });
}
