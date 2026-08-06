import { NextResponse } from "next/server";
import { GET as getScopedBookings } from "@/app/api/admin/bookings/scoped/route";
import { GET as getCronHealth } from "@/app/api/admin/cron-health/route";
import { GET as getMyPermissions } from "@/app/api/admin/security/my-permissions/route";
import {
  canReceiveOfficeWorkItem,
  humanizeCronJobName,
  sortOfficeWorkItems,
  splitWorkItemDescription,
  type OfficeWorkItem,
} from "@/lib/admin/officeWorkItems";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      const priority = overdue ? "critical" : row.date === today ? "high" : "medium";
      return {
        id: `booking.assignment:${id}`,
        type: "booking.assignment",
        title: overdue
          ? `Overdue booking ${shortReference(id)} needs a team`
          : `Booking ${shortReference(id)} needs team allocation`,
        summary: context,
        priority,
        severity: priority,
        status: overdue ? "overdue" : "open",
        category: "operational",
        businessImpact: overdue
          ? "Service date has passed without a team — customer delivery and SLA risk."
          : "Unallocated booking blocks cleaner dispatch and on-time arrival.",
        href: `/office/bookings/${id}`,
        actionLabel: "Assign team",
        requiredPermission: "booking.assign",
        occurredAt: null,
        dueAt: row.date ? `${row.date}T${row.time?.slice(0, 8) || "06:00:00"}+02:00` : null,
        lastSuccessAt: null,
        affectedRecordCount: 1,
        technicalDetails: null,
        branchId: row.city_id ?? null,
        teamId: null,
      } satisfies OfficeWorkItem;
    });
}

function cronBusinessImpact(jobName: string, failed: boolean): string {
  if (jobName.includes("recurring")) {
    return failed
      ? "Recurring schedules may miss generation or charging — customer visits at risk."
      : "Recurring booking automation is overdue and may leave future visits uncreated.";
  }
  if (jobName.includes("monthly-invoice") || jobName.includes("charge-monthly")) {
    return "Monthly invoice billing may stall — receivables and customer statements at risk.";
  }
  if (jobName.includes("payout-integrity")) {
    return "Payout integrity checks are not current — payroll discrepancies may go undetected.";
  }
  if (jobName.includes("notification") || jobName.includes("reminder") || jobName.includes("email") || jobName.includes("payment-recovery")) {
    return "Customer or cleaner notifications may be delayed or failing.";
  }
  return failed
    ? "A scheduled system job failed and needs operational review."
    : "A scheduled system job is stale and may indicate a stuck process.";
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
    const label = humanizeCronJobName(job.job_name);
    const { summary, technicalDetails } = splitWorkItemDescription(
      job.last_run_message,
      failed
        ? `${label} reported an error on its last run.`
        : `${label} has not completed successfully in the expected window.`,
    );
    const priority = failed ? "critical" : "high";
    return [
      {
        id: `system.cron:${job.job_name}`,
        type: "system.cron",
        title: failed ? `${label} failed` : `${label} is stale`,
        summary,
        priority,
        severity: priority,
        status: failed ? "blocked" : "overdue",
        category: "system_health",
        businessImpact: cronBusinessImpact(job.job_name, failed),
        href: "/office/ops-health",
        actionLabel: "Review system health",
        requiredPermission: "ops.health.view",
        occurredAt: job.last_run_at ?? null,
        dueAt: null,
        lastSuccessAt: job.last_success_at ?? null,
        affectedRecordCount: null,
        technicalDetails,
        branchId: null,
        teamId: null,
      } satisfies OfficeWorkItem,
    ];
  });
}

export async function GET(request: Request) {
  const permissionResponse = await getMyPermissions(
    derivedRequest(request, "/api/admin/security/my-permissions"),
  );
  if (!permissionResponse.ok) return permissionResponse;

  const permissionPayload = await jsonFrom<PermissionPayload>(permissionResponse);
  if (!permissionPayload) {
    return NextResponse.json({ error: "Unable to resolve Office permissions." }, { status: 503 });
  }

  const permissions = new Set(permissionPayload.permissions ?? []);
  const items: OfficeWorkItem[] = [];

  if (permissions.has("booking.view") || permissions.has("booking.assign")) {
    const bookingPayload = await jsonFrom<BookingPayload>(
      await getScopedBookings(
        derivedRequest(request, "/api/admin/bookings/scoped", "?page=1&pageSize=100"),
      ),
    );
    if (bookingPayload?.bookings) items.push(...bookingItems(bookingPayload.bookings, permissions));
  }

  if (permissions.has("ops.health.view")) {
    const cronPayload = await jsonFrom<CronPayload>(
      await getCronHealth(derivedRequest(request, "/api/admin/cron-health")),
    );
    if (cronPayload?.jobs) items.push(...cronItems(cronPayload.jobs, permissions));
  }

  const safeItems = sortOfficeWorkItems(
    items.filter((item) => canReceiveOfficeWorkItem(item, permissions)),
  ).slice(0, 30);
  const counts = safeItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.priority] = (acc[item.priority] ?? 0) + 1;
    return acc;
  }, {});
  const groups = safeItems.reduce(
    (acc, item) => {
      if (item.category === "system_health") acc.systemHealth += 1;
      else acc.operational += 1;
      return acc;
    },
    { operational: 0, systemHealth: 0 },
  );

  return NextResponse.json(
    { ok: true, generatedAt: new Date().toISOString(), items: safeItems, counts, groups },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
