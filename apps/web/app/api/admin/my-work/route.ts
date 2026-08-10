import { NextResponse } from "next/server";
import { GET as getScopedBookings } from "@/app/api/admin/bookings/scoped/route";
import { GET as getCronHealth } from "@/app/api/admin/cron-health/route";
import { GET as getMyPermissions } from "@/app/api/admin/security/my-permissions/route";
import { canReceiveOfficeWorkItem, sortOfficeWorkItems, type OfficeWorkItem } from "@/lib/admin/officeWorkItems";
import { hasBookingAssignee } from "@/lib/dispatch/assignmentTruth";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PermissionPayload = { permissions?: string[]; branchIds?: string[]; teamIds?: string[] };
type BookingRow = { id?: string; customer_name?: string | null; service?: string | null; service_slug?: string | null; date?: string | null; time?: string | null; location?: string | null; status?: string | null; cleaner_id?: string | null; team_id?: string | null; city_id?: string | null };
type BookingPayload = { bookings?: BookingRow[] };
type CronJob = { job_name?: string; last_success_at?: string | null; last_run_at?: string | null; last_run_status?: "success" | "error" | null; last_run_message?: string | null };
type CronPayload = { jobs?: CronJob[] };
type MyWorkCategory = "all" | "operations" | "finance" | "workforce" | "customer-care" | "marketing" | "system-health";

const VALID_CATEGORIES = new Set<MyWorkCategory>(["all", "operations", "finance", "workforce", "customer-care", "marketing", "system-health"]);

async function jsonFrom<T>(response: Response): Promise<T | null> { if (!response.ok) return null; try { return (await response.json()) as T; } catch { return null; } }
function derivedRequest(request: Request, pathname: string, search = ""): Request { const url = new URL(request.url); url.pathname = pathname; url.search = search; return new Request(url, { method: "GET", headers: request.headers, cache: "no-store" }); }
function cleanLabel(value: string | null | undefined): string | null { if (!value) return null; return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function shortReference(id: string): string { return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase(); }
function formatZar(cents: number | null | undefined): string { return `R ${Math.round(Number(cents ?? 0) / 100).toLocaleString("en-ZA")}`; }
function normalizePhone(value: string | null | undefined): string { return String(value ?? "").replace(/\D/g, "").replace(/^0/, "27"); }
function maskedPhone(value: string): string { const digits = normalizePhone(value); return digits.length >= 4 ? `••••${digits.slice(-4)}` : "customer number"; }
function formatJohannesburgDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return `${new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(parsed))} SAST`;
}
function addDaysYmd(ymd: string, days: number): string { const d = new Date(`${ymd}T12:00:00+02:00`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function categoryFor(item: OfficeWorkItem): Exclude<MyWorkCategory, "all"> { if (item.type === "booking.assignment") return "operations"; if (item.type === "system.cron") return "system-health"; if (item.type.startsWith("finance.")) return "finance"; if (item.type.startsWith("workforce.")) return "workforce"; if (item.type.startsWith("customer_care.")) return "customer-care"; return "marketing"; }

export function bookingNeedsAllocationWork(row: BookingRow, nearTermEnd: string): boolean {
  if (!row.id || hasBookingAssignee(row)) return false;
  if (row.status === "completed" || row.status === "cancelled") return false;
  return !row.date || row.date <= nearTermEnd;
}

function bookingItems(rows: BookingRow[], permissions: ReadonlySet<string>): OfficeWorkItem[] {
  if (!permissions.has("booking.assign")) return [];
  const today = todayJohannesburg();
  const nearTermEnd = addDaysYmd(today, 7);
  return rows.filter((row) => bookingNeedsAllocationWork(row, nearTermEnd)).map((row) => {
    const id = row.id as string;
    const overdue = Boolean(row.date && row.date < today);
    const isToday = row.date === today;
    const service = cleanLabel(row.service_slug || row.service) || "Cleaning service";
    const customer = row.customer_name?.trim() || "Customer not recorded";
    const slot = [row.date, row.time?.slice(0, 5)].filter(Boolean).join(" · ");
    return { id: `booking.assignment:${id}`, type: "booking.assignment", title: overdue ? `Overdue booking ${shortReference(id)} needs allocation` : isToday ? `Today's booking ${shortReference(id)} needs allocation` : `Upcoming booking ${shortReference(id)} needs allocation`, summary: [service, customer, slot, row.location?.trim()].filter(Boolean).join(" • "), priority: overdue ? "critical" : isToday ? "high" : "medium", status: overdue ? "overdue" : "open", href: `/office/bookings/${id}`, actionLabel: "Assign cleaner or team", requiredPermission: "booking.assign", occurredAt: null, dueAt: row.date ? `${row.date}T${row.time?.slice(0, 8) || "06:00:00"}+02:00` : null, branchId: row.city_id ?? null, teamId: null } satisfies OfficeWorkItem;
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
  const admin = getSupabaseAdmin(); if (!admin) return [];
  const items: OfficeWorkItem[] = [];
  if (permissions.has("finance.full.view")) {
    const { data } = await admin.from("monthly_invoices").select("id,due_date,balance_cents,total_amount_cents,currency_code,updated_at").eq("is_overdue", true).eq("is_closed", false).gt("balance_cents", 0).order("due_date", { ascending: true }).limit(500);
    for (const invoice of data ?? []) items.push({ id: `finance.invoice_overdue:${invoice.id}`, type: "finance.invoice_overdue", title: `Invoice ${shortReference(invoice.id)} is overdue`, summary: `${formatZar(invoice.balance_cents)} outstanding${invoice.due_date ? ` · due ${invoice.due_date}` : ""}`, priority: "high", status: "overdue", href: `/office/invoices/${invoice.id}`, actionLabel: "Review invoice", requiredPermission: "finance.full.view", occurredAt: invoice.updated_at, dueAt: invoice.due_date ? `${invoice.due_date}T23:59:59+02:00` : null, branchId: null, teamId: null });
  }
  if (permissions.has("payout.prepare")) {
    const { data } = await admin.from("cleaner_earnings").select("id,amount_cents,approved_at").eq("status", "approved").is("disbursement_id", null).order("approved_at", { ascending: true }).limit(5000);
    if ((data ?? []).length) { const total = (data ?? []).reduce((s, r) => s + Number(r.amount_cents ?? 0), 0); items.push({ id: "finance.payout_prepare:approved-unbatched", type: "finance.payout_prepare", title: `${data!.length} approved earning${data!.length === 1 ? "" : "s"} ready for payout`, summary: `${formatZar(total)} approved and not yet batched`, priority: "high", status: "open", href: "/office/payouts", actionLabel: "Prepare payouts", requiredPermission: "payout.prepare", occurredAt: data![0]?.approved_at ?? null, dueAt: null, branchId: null, teamId: null }); }
  }
  return items;
}

async function workforceItems(permissions: ReadonlySet<string>): Promise<OfficeWorkItem[]> {
  if (!permissions.has("application.decide")) return [];
  const admin = getSupabaseAdmin(); if (!admin) return [];
  const { data } = await admin.from("cleaner_applications").select("id,name,location,city_id,status,created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1000);
  const now = Date.now();
  return (data ?? []).map((a) => { const created = a.created_at ? Date.parse(a.created_at) : Number.NaN; const overdue = Number.isFinite(created) && now - created >= 2 * 86400000; const name = a.name?.trim() || "Cleaner applicant"; return { id: `workforce.application:${a.id}`, type: "workforce.application", title: overdue ? `${name} application needs review` : `New cleaner application from ${name}`, summary: `${a.location?.trim() || "Location not recorded"}${a.created_at ? ` • Applied ${a.created_at.slice(0, 10)}` : ""}`, priority: overdue ? "high" : "medium", status: overdue ? "overdue" : "open", href: `/office/cleaner-applications?application=${encodeURIComponent(a.id)}`, actionLabel: "Review application", requiredPermission: "application.decide", occurredAt: a.created_at, dueAt: Number.isFinite(created) ? new Date(created + 2 * 86400000).toISOString() : null, branchId: a.city_id ?? null, teamId: null } satisfies OfficeWorkItem; });
}

async function customerCareItems(permissions: ReadonlySet<string>, branchIds: readonly string[]): Promise<OfficeWorkItem[]> {
  if (!permissions.has("customer.contact")) return [];
  const admin = getSupabaseAdmin(); if (!admin) return [];
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: events } = await admin.from("whatsapp_provider_events").select("id,phone,direction,event_type,created_at").gte("created_at", since).in("event_type", ["message", "admin_reply"]).order("created_at", { ascending: false }).limit(2000);
  const latest = new Map<string, any>();
  for (const e of events ?? []) { const key = normalizePhone(e.phone); if (key && !latest.has(key)) latest.set(key, e); }
  const pending = [...latest.entries()].filter(([, e]) => e.direction === "inbound" && e.event_type === "message");
  if (!pending.length) return [];
  const phones = pending.map(([p]) => p);
  const { data: bookings } = await admin.from("bookings").select("normalized_phone,customer_phone,city_id,created_at").or(phones.map((p) => `normalized_phone.eq.${p},customer_phone.eq.${p}`).join(",")).order("created_at", { ascending: false }).limit(2000);
  const cityByPhone = new Map<string, string | null>();
  for (const b of bookings ?? []) for (const candidate of [b.normalized_phone, b.customer_phone]) { const key = normalizePhone(candidate); if (key && !cityByPhone.has(key)) cityByPhone.set(key, b.city_id ?? null); }
  const allowed = new Set(branchIds); const global = branchIds.length === 0; const now = Date.now();
  return pending.flatMap(([phone, e]) => { const branchId = cityByPhone.get(phone) ?? null; if (!global && (!branchId || !allowed.has(branchId))) return []; const occurred = e.created_at ? Date.parse(e.created_at) : Number.NaN; const wait = Number.isFinite(occurred) ? Math.max(0, now - occurred) : 0; const critical = wait >= 4 * 3600000; const overdue = wait >= 3600000; return [{ id: `customer_care.whatsapp_reply:${e.id}`, type: "customer_care.whatsapp_reply", title: critical ? `WhatsApp customer ${maskedPhone(phone)} has waited over 4 hours` : `WhatsApp customer ${maskedPhone(phone)} needs a reply`, summary: e.created_at ? `Latest inbound message received ${formatJohannesburgDateTime(e.created_at)}` : "Latest inbound WhatsApp message has no admin reply.", priority: critical ? "critical" : overdue ? "high" : "medium", status: overdue ? "overdue" : "open", href: `/office/notification-logs?conversation=${encodeURIComponent(phone)}`, actionLabel: "Reply on WhatsApp", requiredPermission: "customer.contact", occurredAt: e.created_at, dueAt: Number.isFinite(occurred) ? new Date(occurred + 3600000).toISOString() : null, branchId, teamId: null } satisfies OfficeWorkItem]; });
}

async function marketingItems(permissions: ReadonlySet<string>): Promise<OfficeWorkItem[]> {
  const admin = getSupabaseAdmin(); if (!admin) return [];
  const items: OfficeWorkItem[] = []; const now = Date.now();
  if (permissions.has("content.draft")) { const { data } = await admin.from("blog_posts").select("id,slug,title,status,created_at,updated_at").eq("status", "draft").order("updated_at", { ascending: true }).limit(1000); for (const d of data ?? []) { const touched = d.updated_at ?? d.created_at; const ms = touched ? Date.parse(touched) : Number.NaN; const overdue = Number.isFinite(ms) && now - ms >= 7 * 86400000; items.push({ id: `marketing.blog_draft:${d.id}`, type: "marketing.blog_draft", title: overdue ? `Blog draft needs attention: ${d.title?.trim() || "Untitled draft"}` : `Blog draft ready to continue: ${d.title?.trim() || "Untitled draft"}`, summary: d.slug ? `/blog/${d.slug}` : "Draft blog post", priority: overdue ? "high" : "medium", status: overdue ? "overdue" : "open", href: `/office/blog?post=${encodeURIComponent(d.id)}`, actionLabel: "Continue draft", requiredPermission: "content.draft", occurredAt: touched, dueAt: Number.isFinite(ms) ? new Date(ms + 7 * 86400000).toISOString() : null, branchId: null, teamId: null }); } }
  if (permissions.has("content.publish")) { const { data } = await admin.from("campaign_content").select("id,title,channel,status,created_at,updated_at").eq("status", "ready").order("updated_at", { ascending: true }).limit(1000); for (const c of data ?? []) { const touched = c.updated_at ?? c.created_at; const ms = touched ? Date.parse(touched) : Number.NaN; const overdue = Number.isFinite(ms) && now - ms >= 3 * 86400000; items.push({ id: `marketing.campaign_ready:${c.id}`, type: "marketing.campaign_ready", title: `${cleanLabel(c.channel) || "Campaign"} content ready for publishing review`, summary: c.title?.trim() || "Campaign content is ready for review.", priority: overdue ? "high" : "medium", status: overdue ? "overdue" : "open", href: `/office/marketing?content=${encodeURIComponent(c.id)}`, actionLabel: "Review campaign", requiredPermission: "content.publish", occurredAt: touched, dueAt: Number.isFinite(ms) ? new Date(ms + 3 * 86400000).toISOString() : null, branchId: null, teamId: null }); } }
  return items;
}

export async function GET(request: Request) {
  const permissionResponse = await getMyPermissions(derivedRequest(request, "/api/admin/security/my-permissions"));
  if (!permissionResponse.ok) return permissionResponse;
  const permissionPayload = await jsonFrom<PermissionPayload>(permissionResponse);
  if (!permissionPayload) return NextResponse.json({ error: "Unable to resolve Office permissions." }, { status: 503 });
  const permissions = new Set(permissionPayload.permissions ?? []);
  const items: OfficeWorkItem[] = [];
  if (permissions.has("booking.view") || permissions.has("booking.assign")) { const p = await jsonFrom<BookingPayload>(await getScopedBookings(derivedRequest(request, "/api/admin/bookings/scoped", "?page=1&pageSize=500"))); if (p?.bookings) items.push(...bookingItems(p.bookings, permissions)); }
  if (permissions.has("ops.health.view")) { const p = await jsonFrom<CronPayload>(await getCronHealth(derivedRequest(request, "/api/admin/cron-health"))); if (p?.jobs) items.push(...cronItems(p.jobs, permissions)); }
  if (permissions.has("finance.full.view") || permissions.has("payout.prepare")) items.push(...await financeItems(permissions));
  if (permissions.has("application.decide")) items.push(...await workforceItems(permissions));
  if (permissions.has("customer.contact")) items.push(...await customerCareItems(permissions, permissionPayload.branchIds ?? []));
  if (permissions.has("content.draft") || permissions.has("content.publish")) items.push(...await marketingItems(permissions));

  const url = new URL(request.url);
  const requestedCategory = (url.searchParams.get("category") || "all") as MyWorkCategory;
  const category = VALID_CATEGORIES.has(requestedCategory) ? requestedCategory : "all";
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize")) || 30));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const allSafe = sortOfficeWorkItems(items.filter((item) => canReceiveOfficeWorkItem(item, permissions)));
  const categoryCounts = allSafe.reduce<Record<string, number>>((acc, item) => { const c = categoryFor(item); acc[c] = (acc[c] ?? 0) + 1; return acc; }, {});
  const filtered = category === "all" ? allSafe : allSafe.filter((item) => categoryFor(item) === category);
  const priorityCounts = filtered.reduce<Record<string, number>>((acc, item) => { acc[item.priority] = (acc[item.priority] ?? 0) + 1; return acc; }, {});
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), items: pageItems, counts: priorityCounts, total, totalAll: allSafe.length, page: safePage, pageSize, totalPages, category, categoryCounts, nearTermBookingDays: 7 }, { headers: { "Cache-Control": "private, no-store" } });
}
