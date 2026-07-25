/**
 * Office dashboard three-layer audit runner.
 *
 * Usage (repo root):
 *   OFFICE_AUDIT_READ_ONLY=true OFFICE_AUDIT_TARGET=local npm run audit:office
 *
 * Production:
 *   OFFICE_AUDIT_READ_ONLY=true OFFICE_AUDIT_TARGET=production \
 *   OFFICE_AUDIT_BASE_URL=https://shalean.co.za \
 *   OFFICE_AUDIT_ADMIN_EMAIL=... OFFICE_AUDIT_ADMIN_PASSWORD=... \
 *   npm run audit:office
 *
 * Safety: refuse production without OFFICE_AUDIT_READ_ONLY=true.
 * Read-only: GET/HEAD only; no booking/payment/cleaner mutations.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";

import { getOfficeMetricRegistry } from "@/lib/admin/officeAudit/metricRegistry";
import {
  compareMetricLayers,
  emptyLayer,
  finalizeReport,
  valueLayer,
} from "@/lib/admin/officeAudit/compareLayers";
import {
  applicationAssignmentKindFromLabel,
  independentAssignmentKind,
  independentCleanerCapacity,
  independentOpsSnapshot,
  independentOverdueZar,
  independentPaymentDayRevenue,
  independentPendingZar,
  independentScheduleStats,
  independentStatusLabel,
  independentSystemHealthLabel,
  independentVisitPaidValueZar,
  type IndependentBookingRow,
  type IndependentCleanerRow,
} from "@/lib/admin/officeAudit/independentCalculations";
import { detectStaleFetchedAt, johannesburgYmd, normalizeStatusLabel } from "@/lib/admin/officeAudit/parseValues";
import { assertNoSensitiveLeak, redactAuditValue } from "@/lib/admin/officeAudit/redactAudit";
import {
  assertOfficeAuditMayRun,
  createReadOnlyFetch,
  loadOfficeAuditSafetyFromEnv,
} from "@/lib/admin/officeAudit/safety";
import type { LayerEvidence, MetricAuditResult, OfficeAuditReport } from "@/lib/admin/officeAudit/types";

import { computeOfficeTodayScheduleStats, officeScheduleStatusPresentation } from "@/lib/admin/officeTodayScheduleStats";
import {
  computeOfficeScheduleCleanerStats,
  officeScheduleAssignedCleanerLabel,
  type OfficeScheduleDayBooking,
  type OfficeScheduleDayCleaner,
} from "@/lib/admin/officeScheduleDayPresentation";
import { computeOfficeVisitDayFinance } from "@/lib/admin/dashboardVisitDayFinance";
import { computeAdminDashboardRevenueSummary } from "@/lib/admin/dashboardRevenue";
import { computeOpsSnapshotFromRows, OPS_SNAPSHOT_BOOKING_SELECT } from "@/lib/admin/opsSnapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, "../..");
const REPO_ROOT = resolve(WEB_ROOT, "../..");

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(WEB_ROOT, ".env.local"));
loadEnvFile(resolve(REPO_ROOT, ".env.local"));

const writeAttempts = { count: 0 };
const readOnlyFetch = createReadOnlyFetch(writeAttempts);

const DAY_BOOKING_SELECT =
  "id, date, time, status, cleaner_id, selected_cleaner_id, team_id, is_team_job, dispatch_status, payment_status, payment_completed_at, payment_method, total_paid_zar, amount_paid_cents, total_price, refunded_at, refund_status, billing_type, is_monthly_billing_booking, monthly_invoice_id, is_recurring_generated, recurring_id, became_pending_at, created_at";

async function pageAll<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number,
  maxRows: number,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) return { rows, truncated: false };
    from += pageSize;
    if (from >= maxRows) return { rows, truncated: true };
  }
}

async function attachRoster(
  admin: SupabaseClient,
  bookings: IndependentBookingRow[],
): Promise<IndependentBookingRow[]> {
  const ids = bookings.map((b) => String(b.id ?? "")).filter(Boolean);
  const roster = new Map<string, Array<{ cleaner_id: string }>>();
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { data, error } = await admin.from("booking_cleaners").select("booking_id, cleaner_id").in("booking_id", slice);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const bid = String((row as { booking_id?: string }).booking_id ?? "");
      const cid = String((row as { cleaner_id?: string }).cleaner_id ?? "");
      if (!bid || !cid) continue;
      const list = roster.get(bid) ?? [];
      list.push({ cleaner_id: cid });
      roster.set(bid, list);
    }
  }
  return bookings.map((b) => {
    const id = String(b.id ?? "");
    const fromTable = roster.get(id) ?? [];
    if (fromTable.length) return { ...b, booking_cleaners: fromTable };
    if (b.cleaner_id) return { ...b, booking_cleaners: [{ cleaner_id: String(b.cleaner_id) }] };
    return { ...b, booking_cleaners: [] };
  });
}

type CapturedLayers = {
  db: Record<string, unknown>;
  app: Record<string, unknown>;
  ui: Record<string, unknown>;
  uiAvailable: boolean;
  appViaHttp: boolean;
  schemaNotes: string[];
  stale: boolean;
};

async function captureDatabaseAndApp(admin: SupabaseClient, auditYmd: string, now: Date): Promise<Omit<CapturedLayers, "ui" | "uiAvailable">> {
  const schemaNotes: string[] = [
    "bookings.date is the schedule/start date column (text YYYY-MM-DD); bookings.booking_date does not exist",
    "public.payments does not exist; home revenue uses booking payment columns",
    "payment_transactions exists as ledger but is not the home dashboard revenue SoT",
    "Needs Action uses cleaner_id/team_id only (not booking_cleaners); schedule assignment includes roster",
  ];

  const { rows: dayRowsRaw, truncated: dayTrunc } = await pageAll<IndependentBookingRow>(
    async (from, to) =>
      admin
        .from("bookings")
        .select(DAY_BOOKING_SELECT)
        .eq("date", auditYmd)
        .order("time", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    500,
    10_000,
  );
  if (dayTrunc) schemaNotes.push("Day bookings scan truncated at 10000 rows");
  const dayRows = await attachRoster(admin, dayRowsRaw);

  const { data: cleanersData, error: cleanersErr } = await admin
    .from("cleaners")
    .select("id, is_available, status, is_active, availability_weekdays")
    .or("is_active.is.null,is_active.eq.true");
  if (cleanersErr) throw new Error(cleanersErr.message);
  const cleaners = (cleanersData ?? []) as IndependentCleanerRow[];

  const windowStartIso = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
  const { data: paidWindow, error: paidErr } = await admin
    .from("bookings")
    .select(
      "id,status,payment_status,payment_completed_at,total_paid_zar,amount_paid_cents,refunded_at,refund_status,billing_type,is_monthly_billing_booking,monthly_invoice_id",
    )
    .eq("payment_status", "success")
    .not("payment_completed_at", "is", null)
    .gte("payment_completed_at", windowStartIso)
    .limit(15000);
  if (paidErr) throw new Error(paidErr.message);

  const { data: pendingRows, error: pendingErr } = await admin
    .from("bookings")
    .select("id,status,payment_status,total_price,total_paid_zar,amount_paid_cents")
    .in("status", ["pending_payment"])
    .in("payment_status", ["pending", "pending_payment"])
    .limit(1000);
  if (pendingErr) throw new Error(pendingErr.message);

  const { data: overdueRows, error: overdueErr } = await admin
    .from("monthly_invoices")
    .select("id,balance_cents,status,is_overdue,due_date")
    .or("status.eq.overdue,is_overdue.eq.true")
    .limit(1000);
  if (overdueErr) throw new Error(overdueErr.message);

  const { rows: openRows, truncated: opsTrunc } = await pageAll<IndependentBookingRow>(
    async (from, to) =>
      admin
        .from("bookings")
        .select(OPS_SNAPSHOT_BOOKING_SELECT)
        .not("status", "in", "(completed,cancelled,failed,payment_expired)")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    1000,
    50_000,
  );
  if (opsTrunc) schemaNotes.push("Ops open-booking scan truncated at 50000 — Needs Action may undercount");

  // payments table probe
  const paymentsProbe = await admin.from("payments").select("id").limit(1);
  if (paymentsProbe.error) {
    schemaNotes.push(`public.payments unavailable: ${paymentsProbe.error.message}`);
  } else {
    schemaNotes.push("UNEXPECTED: public.payments query succeeded — investigate schema drift");
  }

  // Independent DB layer
  const dbSchedule = independentScheduleStats(dayRows);
  const dbVisitPaid = independentVisitPaidValueZar(dayRows);
  const dbRevenue = independentPaymentDayRevenue((paidWindow ?? []) as IndependentBookingRow[], now);
  const dbPending = independentPendingZar((pendingRows ?? []) as IndependentBookingRow[]);
  const dbOverdue = independentOverdueZar(overdueRows ?? []);
  const dbOps = independentOpsSnapshot(openRows, now.getTime(), Number(process.env.DISPATCH_SLA_BREACH_MINUTES ?? 10) || 10);
  const dbCapacity = independentCleanerCapacity({ bookings: dayRows, cleaners, dateYmd: auditYmd });

  let statusMismatches = 0;
  let assignmentMismatches = 0;
  for (const row of dayRows) {
    // Application presentation for comparison of rule fidelity (ids never stored)
    const appLabel = normalizeStatusLabel(officeScheduleStatusPresentation(row as never).label);
    const dbLabel = normalizeStatusLabel(independentStatusLabel(row));
    if (appLabel !== dbLabel) statusMismatches += 1;
    const appKind = applicationAssignmentKindFromLabel(
      officeScheduleAssignedCleanerLabel(row as never, new Map()),
    );
    // Prefer kind from fields when names unavailable
    const dbKind = independentAssignmentKind(row);
    // Without cleaner name map, confirmed/roster labels degrade — compare structural kind only via independent vs field rules
    if (dbKind === "team" && appKind !== "team") assignmentMismatches += 1;
    else if (dbKind === "none" && appKind !== "none") assignmentMismatches += 1;
    else if (dbKind === "preferred" && appKind !== "preferred") assignmentMismatches += 1;
    else if ((dbKind === "confirmed" || dbKind === "roster") && (appKind === "none" || appKind === "preferred" || appKind === "team")) {
      assignmentMismatches += 1;
    }
  }

  const db: Record<string, unknown> = {
    "ops.total_bookings_today": dbSchedule.total,
    "ops.completed": dbSchedule.completed,
    "ops.in_progress": dbSchedule.inProgress,
    "ops.upcoming": dbSchedule.upcoming,
    "ops.unassigned": dbSchedule.unassigned,
    "ops.cancelled_excluded": dbSchedule.cancelled,
    "ops.payments_received_today": dbRevenue.revenueTodayZar,
    "ops.paid_by_payment_time": dbRevenue.paidBookingsToday,
    "ops.visit_paid_value": dbVisitPaid,
    "action.unassigned": dbOps.unassigned,
    "action.starting_within_2h": dbOps.startingSoon,
    "action.sla_breaches": dbOps.slaBreaches,
    "action.unassignable": dbOps.unassignable,
    "schedule.total": dbSchedule.total,
    "schedule.completed": dbSchedule.completed,
    "schedule.in_progress": dbSchedule.inProgress,
    "schedule.upcoming": dbSchedule.upcoming,
    "schedule.unassigned": dbSchedule.unassigned,
    "schedule.row_status_rules": statusMismatches,
    "schedule.row_assignment_rules": assignmentMismatches,
    "capacity.active_workforce": dbCapacity.total,
    "capacity.available_now": dbCapacity.availableIdle,
    "capacity.available": dbCapacity.availableIdle,
    "capacity.booked_or_in_job": dbCapacity.busy,
    "capacity.off_today": dbCapacity.offToday,
    "capacity.offline_or_paused": dbCapacity.manuallyUnavailable,
    "revenue.receivables_exposure": dbRevenue.revenueTodayZar + dbPending + dbOverdue,
    "revenue.payments_received_today": dbRevenue.revenueTodayZar,
    "revenue.pending_bookings": dbPending,
    "revenue.overdue_invoices": dbOverdue,
    "summary.bookings_30d": dbRevenue.totalBookingsWindow,
    "summary.avg_booking_value": dbRevenue.avgBookingValueZar,
    "summary.pending_payments": dbPending,
    "summary.system_health": null, // filled as NOT AUTHORITATIVE below
  };

  // Application layer via the same helpers the APIs use (service-role data path)
  const appSchedule = computeOfficeTodayScheduleStats(dayRows as never[]);
  const appFinance = computeOfficeVisitDayFinance(dayRows as never[]);
  const appRevenue = computeAdminDashboardRevenueSummary((paidWindow ?? []) as never[], now);
  const appOps = computeOpsSnapshotFromRows(openRows as never[], now.getTime());
  const appCapacity = computeOfficeScheduleCleanerStats({
    bookings: dayRows as unknown as OfficeScheduleDayBooking[],
    cleaners: cleaners as unknown as OfficeScheduleDayCleaner[],
    dateYmd: auditYmd,
  });

  let pendingCents = 0;
  for (const row of pendingRows ?? []) {
    const c = Number((row as { amount_paid_cents?: number }).amount_paid_cents);
    if (Number.isFinite(c) && c > 0) pendingCents += c;
    else {
      const z = Number((row as { total_paid_zar?: number }).total_paid_zar);
      if (Number.isFinite(z) && z > 0) pendingCents += Math.round(z * 100);
      else {
        const p = Number((row as { total_price?: number }).total_price);
        if (Number.isFinite(p) && p > 0) pendingCents += Math.round(p * 100);
      }
    }
  }
  const appPendingZar = Math.round(pendingCents / 100);
  const appOverdueZar = Math.round(
    (overdueRows ?? []).reduce((s, r) => {
      const bal = Number((r as { balance_cents?: number }).balance_cents);
      return s + (Number.isFinite(bal) && bal > 0 ? bal : 0);
    }, 0) / 100,
  );

  // Optional HTTP capture for dashboard-stats system health + cross-check
  let appViaHttp = false;
  let httpStats: Record<string, unknown> | null = null;
  const baseUrl = (process.env.OFFICE_AUDIT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "").replace(/\/$/, "");
  const adminToken = process.env.OFFICE_AUDIT_ADMIN_ACCESS_TOKEN?.trim();
  if (baseUrl && adminToken) {
    try {
      const res = await readOnlyFetch(`${baseUrl}/api/admin/dashboard-stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        httpStats = (await res.json()) as Record<string, unknown>;
        appViaHttp = true;
      }
    } catch {
      // keep helper-based app layer
    }
  }

  const systemLabel = httpStats
    ? independentSystemHealthLabel({
        website: (httpStats.systemStatus as { website?: string } | undefined)?.website,
        bookingEngine: (httpStats.systemStatus as { bookingEngine?: string } | undefined)?.bookingEngine,
        paymentGateway: (httpStats.systemStatus as { paymentGateway?: string } | undefined)?.paymentGateway,
        cronErrorsLast24h: (httpStats.systemStatus as { cronErrorsLast24h?: number } | undefined)?.cronErrorsLast24h,
      })
    : null;

  const app: Record<string, unknown> = {
    "ops.total_bookings_today": appSchedule.total,
    "ops.completed": appSchedule.completed,
    "ops.in_progress": appSchedule.inProgress,
    "ops.upcoming": appSchedule.upcoming,
    "ops.unassigned": appSchedule.unassigned,
    "ops.cancelled_excluded": appSchedule.cancelled,
    "ops.payments_received_today": appRevenue.revenueTodayZar,
    "ops.paid_by_payment_time": appRevenue.paidBookingsToday,
    "ops.visit_paid_value": appFinance.paidValueZar,
    "action.unassigned": appOps.unassigned,
    "action.starting_within_2h": appOps.startingSoon,
    "action.sla_breaches": appOps.slaBreaches,
    "action.unassignable": appOps.unassignable,
    "schedule.total": appSchedule.total,
    "schedule.completed": appSchedule.completed,
    "schedule.in_progress": appSchedule.inProgress,
    "schedule.upcoming": appSchedule.upcoming,
    "schedule.unassigned": appSchedule.unassigned,
    "schedule.row_status_rules": statusMismatches,
    "schedule.row_assignment_rules": assignmentMismatches,
    "capacity.active_workforce": appCapacity.total,
    "capacity.available_now": appCapacity.availableIdle,
    "capacity.available": appCapacity.availableIdle,
    "capacity.booked_or_in_job": appCapacity.busy,
    "capacity.off_today": appCapacity.offToday,
    "capacity.offline_or_paused": appCapacity.manuallyUnavailable,
    "revenue.receivables_exposure": appRevenue.revenueTodayZar + appPendingZar + appOverdueZar,
    "revenue.payments_received_today": appRevenue.revenueTodayZar,
    "revenue.pending_bookings": appPendingZar,
    "revenue.overdue_invoices": appOverdueZar,
    "summary.bookings_30d": appRevenue.totalPaidBookingsWindow,
    "summary.avg_booking_value": appRevenue.avgBookingValueZar,
    "summary.pending_payments": appPendingZar,
    "summary.system_health": systemLabel,
  };

  // DB system health cannot be independently authoritative without production health scanner
  db["summary.system_health"] = systemLabel;

  const stale = httpStats?.fetchedAt ? detectStaleFetchedAt(String(httpStats.fetchedAt), now.getTime()) : false;

  return { db, app, appViaHttp, schemaNotes, stale };
}

async function loginOffice(page: Page, baseUrl: string, email: string, password: string) {
  await page.goto(`${baseUrl}/login?redirect=/office`, { waitUntil: "domcontentloaded" });
  // Flexible selectors across login UI variants
  const emailSel = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
  const passSel = page.locator('input[type="password"], input[name="password"]').first();
  await emailSel.waitFor({ timeout: 20_000 });
  await emailSel.fill(email);
  await passSel.fill(password);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
  await page.waitForURL(/\/office/, { timeout: 45_000 });
}

async function captureUi(baseUrl: string): Promise<{ ui: Record<string, unknown>; uiAvailable: boolean; error?: string }> {
  const email = process.env.OFFICE_AUDIT_ADMIN_EMAIL?.trim();
  const password = process.env.OFFICE_AUDIT_ADMIN_PASSWORD?.trim();
  const storageState = process.env.OFFICE_AUDIT_STORAGE_STATE?.trim();
  if (!email && !password && !storageState) {
    return {
      ui: {},
      uiAvailable: false,
      error: "UI capture blocked: set OFFICE_AUDIT_ADMIN_EMAIL/PASSWORD or OFFICE_AUDIT_STORAGE_STATE",
    };
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(storageState ? { storageState } : {});
    const page = await context.newPage();
    if (!storageState) {
      await loginOffice(page, baseUrl, email!, password!);
    } else {
      await page.goto(`${baseUrl}/office`, { waitUntil: "networkidle" });
    }

    // Wait for key metric test ids (or fall back to text)
    await page.waitForTimeout(2500);
    const registry = getOfficeMetricRegistry();
    const ui: Record<string, unknown> = {};
    for (const entry of registry) {
      if (entry.metricId === "schedule.row_status_rules" || entry.metricId === "schedule.row_assignment_rules") {
        // Verified via API/DOM cross-check below; placeholder until filled.
        continue;
      }
      const loc = page.getByTestId(entry.testId);
      if ((await loc.count()) > 0) {
        const text = (await loc.first().innerText()).trim();
        ui[entry.metricId] = text;
      }
    }

    // Row-level status/assignment require DOM↔API pairing. Without a non-PII row key in the
    // DOM we cannot authoritatively verify each badge; leave these unset so the metric is BLOCKED
    // rather than falsely PASS from page-render alone.
    return { ui, uiAvailable: Object.keys(ui).length > 0 };
  } catch (e) {
    return {
      ui: {},
      uiAvailable: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    await browser?.close();
  }
}

function layerFor(
  map: Record<string, unknown>,
  metricId: string,
  source: string,
  available: boolean,
  error?: string,
  notes?: string,
): LayerEvidence {
  if (!available || !(metricId in map) || map[metricId] === null || map[metricId] === undefined) {
    return emptyLayer(source, error ?? "value unavailable", notes);
  }
  return valueLayer(source, map[metricId], notes);
}

function renderMarkdown(report: OfficeAuditReport): string {
  const lines: string[] = [];
  lines.push(`# ${report.title}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Generated | ${report.generatedAt} |`);
  lines.push(`| Audit date (JHB) | ${report.auditDateYmd} |`);
  lines.push(`| Target | ${report.target} |`);
  lines.push(`| Base URL | ${report.baseUrl} |`);
  lines.push(`| Read-only | ${report.readOnly} |`);
  lines.push(`| Decision | ${report.decisionText} |`);
  lines.push("");
  lines.push(`## Counts`);
  lines.push("");
  lines.push(`| Status | Count |`);
  lines.push(`| --- | ---:|`);
  for (const [k, v] of Object.entries(report.counts)) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  lines.push(`## Three-layer results`);
  lines.push("");
  lines.push(`| Metric | UI | App | DB | Status | Finding |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const m of report.metrics) {
    lines.push(
      `| ${m.metricId} | ${String(m.ui.normalized)} | ${String(m.application.normalized)} | ${String(m.database.normalized)} | ${m.status} | ${(m.finding ?? "").replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
  lines.push(`## Schema notes`);
  for (const n of report.schemaNotes) lines.push(`- ${n}`);
  lines.push("");
  lines.push(`## Blockers`);
  if (!report.blockers.length) lines.push(`- none`);
  for (const b of report.blockers) lines.push(`- ${b}`);
  lines.push("");
  lines.push(`## Privacy`);
  lines.push(`- Redaction applied: ${report.privacy.redactionApplied}`);
  lines.push(`- Prohibited fields stripped: ${report.privacy.prohibitedFieldsStripped.join(", ")}`);
  lines.push("");
  lines.push(`## Proposed fixes (not executed)`);
  for (const m of report.metrics.filter((x) => x.status !== "PASS")) {
    lines.push(`- **${m.metricId}** (${m.status}): ${m.proposedFix ?? m.finding ?? "n/a"}`);
  }
  return lines.join("\n");
}

async function main() {
  const safety = loadOfficeAuditSafetyFromEnv();
  const target = safety.target || "local";
  const baseUrl = (process.env.OFFICE_AUDIT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  assertOfficeAuditMayRun({ safety, baseUrl, targetHint: target });

  if (!safety.readOnly) {
    console.error("OFFICE_AUDIT_READ_ONLY=true is required");
    process.exit(2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(2);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();
  const auditYmd = process.env.AUDIT_DATE?.trim() || johannesburgYmd(now);

  const { db, app, appViaHttp, schemaNotes, stale } = await captureDatabaseAndApp(admin, auditYmd, now);
  const uiCapture = await captureUi(baseUrl);

  if (stale) schemaNotes.push("Application fetchedAt older than 5 minutes (stale-data detection)");

  const registry = getOfficeMetricRegistry();
  const metrics: MetricAuditResult[] = [];

  for (const entry of registry) {
    let ui = layerFor(
      uiCapture.ui,
      entry.metricId,
      "playwright:/office",
      uiCapture.uiAvailable,
      uiCapture.error,
    );
    let application = layerFor(
      app,
      entry.metricId,
      appViaHttp ? "http+helpers:/api/admin/*" : "application-helpers+service-role-read",
      true,
    );
    let database = layerFor(db, entry.metricId, "independent-db-calculation", true);

    if (entry.metricId === "summary.system_health") {
      if (app["summary.system_health"] == null) {
        application = emptyLayer(
          "dashboard-stats systemStatus",
          "system health HTTP/app signals unavailable",
          "NOT AUTHORITATIVE",
        );
        database = emptyLayer(
          "independent-db-calculation",
          "cannot reproduce production health scanner from SQL alone",
          "NOT AUTHORITATIVE",
        );
        ui = uiCapture.uiAvailable
          ? layerFor(uiCapture.ui, entry.metricId, "playwright:/office", true)
          : emptyLayer("playwright:/office", uiCapture.error ?? "UI unavailable");
      } else {
        database = {
          ...database,
          notes: "NOT AUTHORITATIVE — mirrors app systemStatus labels; not an independent SQL SoT",
        };
      }
    }

    // Visit paid value may be absent in UI when finance payload missing — still required
    metrics.push(compareMetricLayers(entry, ui, application, database));
  }

  const report = finalizeReport({
    title: "Office Dashboard Three-Layer Audit",
    generatedAt: now.toISOString(),
    auditDateYmd: auditYmd,
    timezone: "Africa/Johannesburg",
    target,
    baseUrl,
    readOnly: true,
    metrics,
    schemaNotes,
    safety: {
      officeAuditReadOnly: safety.readOnly,
      officeAuditTarget: safety.target,
      writeAttemptsBlocked: writeAttempts.count,
    },
  });

  const redacted = redactAuditValue(report) as OfficeAuditReport;
  assertNoSensitiveLeak(redacted);

  const dateStamp = auditYmd;
  const outDir = resolve(REPO_ROOT, "docs/audits/office");
  const evidenceDir = resolve(outDir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const mdPath = resolve(outDir, `OFFICE-3-LAYER-AUDIT-${dateStamp}.md`);
  const jsonPath = resolve(evidenceDir, `OFFICE-3-LAYER-AUDIT-${dateStamp}.json`);
  const registryPath = resolve(outDir, "office-metric-registry.json");

  writeFileSync(mdPath, renderMarkdown(redacted));
  writeFileSync(jsonPath, JSON.stringify(redacted, null, 2));
  writeFileSync(registryPath, JSON.stringify(getOfficeMetricRegistry(), null, 2));

  console.log(redacted.decisionText);
  console.log(`Wrote ${mdPath}`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Counts: ${JSON.stringify(redacted.counts)}`);
  console.log(`UI available: ${uiCapture.uiAvailable}; App via HTTP: ${appViaHttp}; Write attempts blocked: ${writeAttempts.count}`);

  const failed =
    redacted.decision !== "GO" ||
    redacted.counts.FAIL > 0 ||
    redacted.counts.BLOCKED > 0 ||
    redacted.counts["NOT AUTHORITATIVE"] > 0 ||
    redacted.counts["NOT IMPLEMENTED"] > 0 ||
    redacted.counts["SKIPPED WITH JUSTIFICATION"] > 0;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
