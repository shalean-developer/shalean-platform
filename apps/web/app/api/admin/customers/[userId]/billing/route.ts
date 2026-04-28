import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { johannesburgCalendarMonthDateRangeYmd } from "@/lib/dashboard/johannesburgMonth";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { BillingSwitchCode } from "@/lib/admin/billingSwitchCodes";
import {
  readBillingSwitchIdempotencyKey,
  rememberBillingSwitchSuccess,
  tryReplayBillingSwitchSuccess,
} from "@/lib/admin/adminBillingSwitchIdempotency";
import { checkAdminBillingSwitchRateLimit } from "@/lib/admin/adminBillingSwitchRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BILLING_TYPES = new Set(["per_booking", "monthly"]);
const SCHEDULE_TYPES = new Set(["fixed_schedule", "on_demand"]);

/** When true, mid-cycle flips to/from monthly require `confirm_strict` in addition to `confirm`. */
function adminBillingFlipStrictEnabled(): boolean {
  const v = (process.env.ADMIN_BILLING_FLIP_REQUIRE_STRICT_CONFIRM ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export type AdminBillingPatchBody = {
  billing_type: "per_booking" | "monthly";
  schedule_type?: "fixed_schedule" | "on_demand";
  confirm?: boolean;
  confirm_strict?: boolean;
};

async function fetchMonthImpact(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  customerId: string,
): Promise<{
  bookings_count: number;
  invoice_status: string | null;
  invoice_month: string | null;
  /** True when a `monthly_invoices` row exists for the current Johannesburg calendar month (any status). */
  has_month_invoice: boolean;
}> {
  const { ym, startYmd, endYmd } = johannesburgCalendarMonthDateRangeYmd();
  const { count: bookingsCount, error: bookErr } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", customerId)
    .gte("date", startYmd)
    .lte("date", endYmd);
  if (bookErr) throw new Error(bookErr.message);

  const { data: invRow, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, status, month")
    .eq("customer_id", customerId)
    .eq("month", ym)
    .maybeSingle();
  if (invErr) throw new Error(invErr.message);

  const inv = invRow as { id?: string; status?: string; month?: string } | null;
  const hasMonthInvoice = Boolean(inv?.id);
  return {
    bookings_count: typeof bookingsCount === "number" ? bookingsCount : 0,
    invoice_status: hasMonthInvoice ? (inv?.status ?? null) : null,
    invoice_month: hasMonthInvoice ? (inv?.month ?? ym) : null,
    has_month_invoice: hasMonthInvoice,
  };
}

/** Admin: read billing + this-month impact (for confirmation UI). Uses Johannesburg calendar month via `johannesburgCalendarMonthDateRangeYmd`. */
export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId: rawUserId } = await ctx.params;
  const customerId = (rawUserId ?? "").trim();
  if (!isUuid(customerId)) {
    return NextResponse.json({ error: "Invalid customer id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: prof, error: profErr } = await admin
    .from("user_profiles")
    .select("id, billing_type, schedule_type")
    .eq("id", customerId)
    .maybeSingle();
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const p = prof as { billing_type?: string; schedule_type?: string } | null;
  let impact;
  try {
    impact = await fetchMonthImpact(admin, customerId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Impact query failed." }, { status: 500 });
  }

  return NextResponse.json({
    profile_exists: Boolean(p),
    billing_type: p ? String(p.billing_type ?? "per_booking") : null,
    schedule_type: p ? String(p.schedule_type ?? "on_demand") : null,
    impact,
  });
}

async function ensureUserProfile(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  customerId: string,
): Promise<{ billing_type: string; schedule_type: string }> {
  const { data: prof, error: profErr } = await admin
    .from("user_profiles")
    .select("id, billing_type, schedule_type")
    .eq("id", customerId)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);
  if (prof) {
    const p = prof as { billing_type?: string; schedule_type?: string };
    return {
      billing_type: String(p.billing_type ?? "per_booking"),
      schedule_type: String(p.schedule_type ?? "on_demand"),
    };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await admin.from("user_profiles").upsert(
    {
      id: customerId,
      booking_count: 0,
      total_spent_cents: 0,
      billing_type: "per_booking",
      schedule_type: "on_demand",
      updated_at: now,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (upErr) throw new Error(upErr.message);

  const { data: row, error: againErr } = await admin
    .from("user_profiles")
    .select("id, billing_type, schedule_type")
    .eq("id", customerId)
    .maybeSingle();
  if (againErr) throw new Error(againErr.message);
  const r = row as { billing_type?: string; schedule_type?: string } | null;
  if (!r) throw new Error("Profile could not be created.");
  return {
    billing_type: String(r.billing_type ?? "per_booking"),
    schedule_type: String(r.schedule_type ?? "on_demand"),
  };
}

/**
 * Admin: update customer billing_model on user_profiles (service role; bypasses customer RLS).
 * Month guards use `johannesburgCalendarMonthDateRangeYmd` (single source of truth for JHB calendar month).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();

  const { userId: rawUserId } = await ctx.params;
  const customerId = (rawUserId ?? "").trim();
  if (!isUuid(customerId)) {
    return NextResponse.json({ error: "Invalid customer id." }, { status: 400 });
  }

  let body: AdminBillingPatchBody;
  try {
    body = (await request.json()) as AdminBillingPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const billing_type = typeof body.billing_type === "string" ? body.billing_type.trim().toLowerCase() : "";
  if (!BILLING_TYPES.has(billing_type)) {
    return NextResponse.json({ error: "billing_type must be per_booking or monthly." }, { status: 400 });
  }

  const schedule_in =
    typeof body.schedule_type === "string" ? body.schedule_type.trim().toLowerCase() : undefined;
  if (schedule_in !== undefined && !SCHEDULE_TYPES.has(schedule_in)) {
    return NextResponse.json({ error: "schedule_type must be fixed_schedule or on_demand." }, { status: 400 });
  }

  const confirm = body.confirm === true;
  const confirm_strict = body.confirm_strict === true;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const idempotencyKey = readBillingSwitchIdempotencyKey(request);
  if (idempotencyKey) {
    const replay = await tryReplayBillingSwitchSuccess(admin, customerId, idempotencyKey);
    if (replay) {
      return NextResponse.json(replay.body, {
        status: replay.status,
        headers: { "X-Idempotent-Replayed": "1" },
      });
    }
  }

  let fromRow: { billing_type: string; schedule_type: string };
  try {
    fromRow = await ensureUserProfile(admin, customerId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Profile setup failed." }, { status: 500 });
  }

  const fromBilling = fromRow.billing_type;
  const fromSchedule = fromRow.schedule_type;
  let toSchedule = schedule_in ?? fromSchedule;
  if (billing_type === "monthly") {
    toSchedule = "on_demand";
  }
  const schedule_enforced = billing_type === "monthly" && (schedule_in ?? fromSchedule) !== "on_demand";

  if (fromBilling === billing_type && fromSchedule === toSchedule) {
    const impactNoop = await fetchMonthImpact(admin, customerId).catch(() => ({
      bookings_count: 0,
      invoice_status: null,
      invoice_month: null,
      has_month_invoice: false,
    }));
    const noopBody = {
      ok: true,
      code: BillingSwitchCode.NO_CHANGE,
      requires_confirmation: false,
      requires_strict_confirmation: false,
      billing_type: fromBilling,
      schedule_type: fromSchedule,
      schedule_enforced: false,
      impact: impactNoop,
    };
    if (idempotencyKey) {
      await rememberBillingSwitchSuccess(admin, customerId, idempotencyKey, 200, noopBody as unknown as Record<string, unknown>);
    }
    return NextResponse.json(noopBody);
  }

  const rate = checkAdminBillingSwitchRateLimit(auth.userId, customerId);
  if (!rate.ok) {
    return NextResponse.json(
      { error: rate.error },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  let impact;
  try {
    impact = await fetchMonthImpact(admin, customerId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Impact query failed." }, { status: 500 });
  }

  const bookingsThisMonth = impact.bookings_count;
  const hasMonthInvoice = impact.has_month_invoice;
  const hasActivity = bookingsThisMonth > 0 || hasMonthInvoice;

  const flippingMonthly =
    fromBilling !== billing_type && (fromBilling === "monthly" || billing_type === "monthly");
  const strictScenario =
    adminBillingFlipStrictEnabled() &&
    flippingMonthly &&
    bookingsThisMonth > 0 &&
    hasMonthInvoice;

  if (hasActivity && !confirm) {
    return NextResponse.json({
      ok: true,
      code: BillingSwitchCode.EXISTING_ACTIVITY_THIS_MONTH,
      requires_confirmation: true,
      requires_strict_confirmation: false,
      schedule_enforced: false,
      reason: "existing_activity_this_month",
      details: {
        bookings_count: bookingsThisMonth,
        invoice_status: impact.invoice_status,
        invoice_month: impact.invoice_month,
      },
      billing_type: fromBilling,
      schedule_type: fromSchedule,
      impact,
    });
  }

  if (strictScenario && confirm && !confirm_strict) {
    return NextResponse.json({
      ok: true,
      code: BillingSwitchCode.STRICT_CONFIRM_REQUIRED,
      requires_confirmation: false,
      requires_strict_confirmation: true,
      schedule_enforced: false,
      reason: "mid_cycle_monthly_flip",
      details: {
        bookings_count: bookingsThisMonth,
        invoice_status: impact.invoice_status,
        invoice_month: impact.invoice_month,
      },
      billing_type: fromBilling,
      schedule_type: fromSchedule,
      impact,
    });
  }

  const { data: rpcRaw, error: rpcErr } = await admin.rpc("admin_billing_switch_finalize", {
    p_customer_id: customerId,
    p_billing_type: billing_type,
    p_target_schedule_type: toSchedule,
    p_schedule_enforced: schedule_enforced,
    p_confirm: confirm,
    p_confirm_strict: confirm_strict,
    p_strict_flip_enabled: adminBillingFlipStrictEnabled(),
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const rpcJson = rpcRaw as Record<string, unknown> | null;
  if (!rpcJson || rpcJson.ok === false) {
    const errMsg =
      rpcJson && typeof rpcJson.error === "string" ? rpcJson.error : "Billing switch could not be applied.";
    return NextResponse.json({ error: errMsg }, { status: 400 });
  }

  const code = rpcJson.code;
  if (
    code === BillingSwitchCode.EXISTING_ACTIVITY_THIS_MONTH ||
    code === BillingSwitchCode.STRICT_CONFIRM_REQUIRED
  ) {
    return NextResponse.json(rpcJson);
  }

  if (code !== BillingSwitchCode.NO_CHANGE && code !== BillingSwitchCode.UPDATED) {
    return NextResponse.json({ error: "Unexpected billing switch response." }, { status: 500 });
  }

  const impactOut = rpcJson.impact as (typeof impact) | undefined;
  const bookingsFinal = typeof impactOut?.bookings_count === "number" ? impactOut.bookings_count : 0;
  const hasMonthInvoiceFinal = Boolean(impactOut?.has_month_invoice);
  const strictLatest =
    adminBillingFlipStrictEnabled() &&
    flippingMonthly &&
    bookingsFinal > 0 &&
    hasMonthInvoiceFinal;

  if (code === BillingSwitchCode.UPDATED) {
    const ts = new Date().toISOString();
    const billingOut = String(rpcJson.billing_type ?? billing_type);
    const scheduleOut = String(rpcJson.schedule_type ?? toSchedule);
    await logSystemEvent({
      level: "info",
      source: "admin_billing_switch",
      message: "admin_changed_billing_type",
      context: {
        event: "admin_changed_billing_type",
        rpc_invoked: true,
        rpc_code: String(code),
        customer_id: customerId,
        from: fromBilling,
        to: billing_type,
        schedule_from: fromSchedule,
        schedule_to: toSchedule,
        before: { billing_type: fromBilling, schedule_type: fromSchedule },
        after: {
          billing_type: billingOut,
          schedule_type: scheduleOut,
        },
        ts,
        schedule_enforced,
        admin_id: auth.userId,
        bookings_count_this_month: bookingsFinal,
        invoice_status: impactOut?.invoice_status ?? null,
        invoice_month: impactOut?.invoice_month ?? null,
        has_month_invoice: hasMonthInvoiceFinal,
        confirm_strict_used: strictLatest ? confirm_strict : false,
        idempotency_key: idempotencyKey ?? null,
        request_id: requestId,
      },
    });
  }

  if (idempotencyKey) {
    await rememberBillingSwitchSuccess(admin, customerId, idempotencyKey, 200, rpcJson as Record<string, unknown>);
  }

  return NextResponse.json(rpcJson);
}
