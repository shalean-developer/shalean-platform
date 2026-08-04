import { NextResponse } from "next/server";
import { GET as getScopedBookings } from "@/app/api/admin/bookings/scoped/route";
import { GET as getCronHealth } from "@/app/api/admin/cron-health/route";
import { GET as getMyPermissions } from "@/app/api/admin/security/my-permissions/route";
import { requireAnyAdminPermissionFromRequest, type AdminPermission } from "@/lib/admin/requirePermission";
import {
  canReceiveOfficeWorkItem,
  sortOfficeWorkItems,
  type OfficeWorkItem,
} from "@/lib/admin/officeWorkItems";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENTRY_PERMISSIONS: readonly AdminPermission[] = [
  "booking.view",
  "booking.assign",
  "ops.health.view",
  "system.logs",
];

type PermissionPayload = { permissions?: string[]; branchIds?: string[]; teamIds?: string[] };
type BookingRow = { id?: string; date?: string | null; status?: string | null; team_id?: string | null; city_id?: string | null };
type BookingPayload = { bookings?: BookingRow[] };
type CronJob = {
  job_name?: string;
  last_success_at?: string | null;
  last_run_at?: string | null;
  last_run_status?: "success" | "error" | null;
  last_run_message?: string | null;
};
type CronPayload = { jobs?: CronJob[] };

async function jsonFrom<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function derivedRequest(request: Request, pathname: string, search = ""): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = search;
  return new Request(url, {
    method: "GET",
    headers: request.headers,
    cache: "no-store",
  });
}

function bookingItems(rows: BookingRow[], permissions: ReadonlySet<string>): OfficeWorkItem[] {
  if (!permissions.has("booking.assign")) return [];
  const today = todayJohannesburg();
  return rows
    .filter((row) => row.id && !row.team_id && row.status !== "completed" && row.status !== "cancelled")
    .slice(0, 25)
    .map((row) => {
      const overdue = Boolean(row.date && row.date < today);
      return {
        id: `booking.assignment:${row.id}`,
        type: "booking.assignment",
        title: overdue ? "Overdue booking needs a team" : "Booking needs team allocation",
        summary: `Booking ${row.id} is not assigned to an operating team${row.date ? ` for ${row.date}` : ""}.`,
        priority: overdue ? "critical" : row.date === today ? "high" : "medium",
        status: overdue ? "overdue" : "open",
        href: `/office/bookings/${row.id}`,
        actionLabel: "Assign team",
        requiredPermission: "booking.assign",
        occurredAt: null,
        dueAt: row.date ? `${row.date}T06:00:00+02:00` : null,
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

  const permissionResponse = await getMyPermissions(
    derivedRequest(request, "/api/admin/security/my-permissions"),
  );
  const permissionPayload = await jsonFrom<PermissionPayload>(permissionResponse);
  if (!permissionPayload) {
    return NextResponse.json({ error: "Unable to resolve Office permissions." }, { status: 503 });
  }

  const permissions = new Set(permissionPayload.permissions ?? []);
  const items: OfficeWorkItem[] = [];

  if (permissions.has("booking.view") || permissions.has("booking.assign")) {
    const bookingResponse = await getScopedBookings(
      derivedRequest(request, "/api/admin/bookings/scoped", "?page=1&pageSize=100"),
    );
    const bookingPayload = await jsonFrom<BookingPayload>(bookingResponse);
    if (bookingPayload?.bookings) items.push(...bookingItems(bookingPayload.bookings, permissions));
  }

  if (permissions.has("ops.health.view")) {
    const cronResponse = await getCronHealth(
      derivedRequest(request, "/api/admin/cron-health"),
    );
    const cronPayload = await jsonFrom<CronPayload>(cronResponse);
    if (cronPayload?.jobs) items.push(...cronItems(cronPayload.jobs, permissions));
  }

  const safeItems = sortOfficeWorkItems(
    items.filter((item) => canReceiveOfficeWorkItem(item, permissions)),
  ).slice(0, 30);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    items: safeItems,
    counts: safeItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.priority] = (acc[item.priority] ?? 0) + 1;
      return acc;
    }, {}),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
