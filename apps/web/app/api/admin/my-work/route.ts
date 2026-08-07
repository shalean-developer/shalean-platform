import { NextResponse } from "next/server";
import { GET as getScopedBookings } from "@/app/api/admin/bookings/scoped/route";
import { GET as getCronHealth } from "@/app/api/admin/cron-health/route";
import { GET as getMyPermissions } from "@/app/api/admin/security/my-permissions/route";
import { canReceiveOfficeWorkItem, sortOfficeWorkItems, type OfficeWorkItem } from "@/lib/admin/officeWorkItems";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PermissionPayload = { permissions?: string[] };
type BookingRow = { id?: string; customer_name?: string | null; service?: string | null; service_slug?: string | null; date?: string | null; time?: string | null; location?: string | null; status?: string | null; team_id?: string | null; city_id?: string | null };
type BookingPayload = { bookings?: BookingRow[] };
type CronJob = { job_name?: string; last_success_at?: string | null; last_run_at?: string | null; last_run_status?: "success" | "error" | null; last_run_message?: string | null };
type CronPayload = { jobs?: CronJob[] };
type OverdueInvoiceRow = { id: string; due_date: string | null; balance_cents: number | null; total_amount_cents: number | null; currency_code: string | null; updated_at: string | null };
type CleanerApplicationRow = { id: string; name: string | null; location: string | null; city_id: string | null; status: string | null; created_at: string | null };

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

function shortReference(id: string): string { return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase(); }
function formatZar(cents: number | null | undefined): string { return `R ${Math.round(Number(cents ?? 0) / 100).toLocaleString("en-ZA")}`; }

function bookingItems(rows: BookingRow[], permissions: ReadonlySet<string>): OfficeWorkItem[] {
  if (!permissions.has("booking.assign")) return [];
  const today = todayJohannesburg();
  return rows.filter((row) => row.id && !row.team_id && row.status !== "completed" && row.status !== "cancelled").slice(0, 25).map((row) => {
    const id = row.id as string;
    const overdue = Boolean(row.date && row.date < today);
    const service = cleanLabel(row.service_slug || row.service) || "Cleaning service";
    const customer = row.customer_name?.trim() || "Customer not recorded";
    const slot = [row.date, row.time?.slice(0, 5)].filter(Boolean).join(" · ");
    const context = [service, customer, slot, row.location?.trim()].filter(Boolean).join(" • ");
    return { id: `booking.assignment:${id}`, type: "booking.assignment", title: overdue ? `Overdue booking ${shortReference(id)} needs a team` : `Booking ${shortReference(id)} needs team allocation`, summary: context, priority: overdue ? "critical" : row.date === today ? "high" : "medium", status: overdue ? "overdue" : "open", href: `/office/bookings/${id}`, actionLabel: "Assign team", requiredPermission: "booking.assign", occurredAt: null, dueAt: row.date ? `${row.date}T${row.time?.slice(0, 8) || "06:00:00"}+02:00` : null, branchId: row.city_id ?? null, teamId: null } satisfies OfficeWorkItem;
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
    return [{ id: `system.cron:${job.job_name}`, type: "system.cron", title: failed ? `${job.job_name} failed` : `${job.job_name} is stale`, summary: job.last_run_message || "The scheduled process needs operational review.", priority: failed ? "critical" : "high", status: failed ? "blocked" : "overdue", href: "/office/ops-health", actionLabel: "Review system health", requiredPermission: "ops.health.view", occurredAt: job.last_run_at ?? null, dueAt: null, branchId: null, teamId: null } satisfies OfficeWorkItem];
  });
}

async function financeItems(permissions: ReadonlySet<string>): Promise<OfficeWorkItem[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const items: OfficeWorkItem[] = [];
  if (permissions.has("finance.full.view")) {
    const { data, error } = await admin.from("monthly_invoices").select("id,due_date,balance_cents,total_amount_cents,currency_code,updated_at").eq("is_overdue", true).eq("is_closed", false).gt("balance_cents", 0).order("due_date", { ascending: true }).limit(12);
    if (error) console.error("[my-work] overdue invoice query failed", error.message);
    else for (const raw of data ?? []) {
      const invoice = raw as OverdueInvoiceRow;
      items.push({ id: `finance.invoice_overdue:${invoice.id}`, type: "finance.invoice_overdue", title: `Invoice ${shortReference(invoice.id)} is overdue`, summary: `${formatZar(invoice.balance_cents)} outstanding${invoice.due_date ? ` · due ${invoice.due_date}` : ""}`, priority: "high", status: "overdue", href: `/office/invoices/${invoice.id}`, actionLabel: "Review invoice", requiredPermission: "finance.full.view", occurredAt: invoice.updated_at, dueAt: invoice.due_date ? `${invoice.due_date}T23:59:59+02:00` : null, branchId: null, teamId: null });
    }
  }
  if (permissions.has("payout.prepare")) {
    const { data, error } = await admin.from("cleaner_earnings").select("id,amount_cents,approved_at").eq("status", "approved").is("disbursement_id", null).order("approved_at", { ascending: true }).limit(500);
    if (error) console.error("[my-work] payout preparation query failed", error.message);
    else if ((data ?? []).length > 0) {
      const earnings = data ?? [];
      const totalCents = earnings.reduce((sum, row) => sum + Number((row as { amount_cents?: number | null }).amount_cents ?? 0), 0);
      const firstApprovedAt = String((earnings[0] as { approved_at?: string | null }).approved_at ?? "") || null;
      items.push({ id: "finance.payout_prepare:approved-unbatched", type: "finance.payout_prepare", title: `${earnings.length} approved earning${earnings.length === 1 ? "" : "s"} ready for payout`, summary: `${formatZar(totalCents)} approved and not yet batched`, priority: "high", status: "open", href: "/office/payouts", actionLabel: "Prepare payouts", requiredPermission: "payout.prepare", occurredAt: firstApprovedAt, dueAt: null, branchId: null, teamId: null });
    }
  }
  return items;
}

async function workforceItems(permissions: ReadonlySet<string>): Promise<OfficeWorkItem[]> {
  if (!permissions.has("application.decide")) return [];
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin.from("cleaner_applications").select("id,name,location,city_id,status,created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(25);
  if (error) {
    console.error("[my-work] cleaner application query failed", error.message);
    return [];
  }
  const now = Date.now();
  return (data ?? []).map((raw) => {
    const application = raw as CleanerApplicationRow;
    const createdAtMs = application.created_at ? Date.parse(application.created_at) : Number.NaN;
    const overdue = Number.isFinite(createdAtMs) && now - createdAtMs >= 2 * 24 * 60 * 60_000;
    const name = application.name?.trim() || "Cleaner applicant";
    const location = application.location?.trim() || "Location not recorded";
    return { id: `workforce.application:${application.id}`, type: "workforce.application", title: overdue ? `${name} application needs review` : `New cleaner application from ${name}`, summary: `${location}${application.created_at ? ` • Applied ${application.created_at.slice(0, 10)}` : ""}`, priority: overdue ? "high" : "medium", status: overdue ? "overdue" : "open", href: `/office/cleaner-applications?application=${encodeURIComponent(application.id)}`, actionLabel: "Review application", requiredPermission: "application.decide", occurredAt: application.created_at, dueAt: Number.isFinite(createdAtMs) ? new Date(createdAtMs + 2 * 24 * 60 * 60_000).toISOString() : null, branchId: application.city_id ?? null, teamId: null } satisfies OfficeWorkItem;
  });
}

export async function GET(request: Request) {
  const permissionResponse = await getMyPermissions(derivedRequest(request, "/api/admin/security/my-permissions"));
  if (!permissionResponse.ok) return permissionResponse;
  const permissionPayload = await jsonFrom<PermissionPayload>(permissionResponse);
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
  if (permissions.has("finance.full.view") || permissions.has("payout.prepare")) items.push(...(await financeItems(permissions)));
  if (permissions.has("application.decide")) items.push(...(await workforceItems(permissions)));

  const safeItems = sortOfficeWorkItems(items.filter((item) => canReceiveOfficeWorkItem(item, permissions))).slice(0, 30);
  const counts = safeItems.reduce<Record<string, number>>((acc, item) => { acc[item.priority] = (acc[item.priority] ?? 0) + 1; return acc; }, {});
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), items: safeItems, counts }, { headers: { "Cache-Control": "private, no-store" } });
}
