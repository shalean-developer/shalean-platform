import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { resendBookingConfirmationEmails } from "@/lib/notifications/resendBookingConfirmationEmails";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function boolish(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: bookingId } = await ctx.params;
  if (!bookingId?.trim()) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  let body: { includeCustomer?: unknown; includeAdmin?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* empty body is fine */
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const result = await resendBookingConfirmationEmails(admin, bookingId.trim(), {
      includeCustomer: body.includeCustomer === undefined ? true : boolish(body.includeCustomer),
      includeAdmin: body.includeAdmin === undefined ? true : boolish(body.includeAdmin),
    });

    const anySent = result.customer.sent || result.admin.sent;
    const attempted = [result.customer, result.admin].filter((r) => r.attempted);
    const allFailed = attempted.length > 0 && attempted.every((r) => !r.sent);

    await logSystemEvent({
      level: anySent ? "info" : "warn",
      source: "admin_resend_confirmation_emails",
      message: anySent ? "Admin resent booking confirmation emails" : "Admin resend confirmation emails failed",
      context: { bookingId, result },
    });

    if (allFailed) {
      return NextResponse.json(
        {
          ok: false,
          error: result.customer.error ?? result.admin.error ?? "All email resends failed.",
          result,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
