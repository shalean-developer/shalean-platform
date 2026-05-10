import { NextResponse } from "next/server";
import {
  cleanerAcceptBooking,
  cleanerRejectBooking,
  type BookingOperationResult,
} from "@/lib/booking/bookingOperations";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Status + JSON body returned to the client (matches the cleaner lifecycle HTTP bundle shape). */
type RespondLifecycleHttpResult = { status: number; json: Record<string, unknown> };

function gatewayLifecycleOpToResult(
  op: BookingOperationResult<Record<string, unknown>>,
): RespondLifecycleHttpResult {
  if (op.ok) {
    return { status: 200, json: (op.data ?? { ok: true }) as Record<string, unknown> };
  }
  const st = typeof op.httpStatus === "number" ? op.httpStatus : 400;
  const json =
    op.cause && typeof op.cause === "object" && !Array.isArray(op.cause)
      ? (op.cause as Record<string, unknown>)
      : ({ error: op.message, code: op.code } as Record<string, unknown>);
  return { status: st, json };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let body: { bookingId?: unknown; cleanerId?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  if (!bookingId || !UUID_RE.test(bookingId)) {
    return NextResponse.json({ error: "Invalid booking id." }, { status: 400 });
  }

  const actionRaw = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  const action = actionRaw === "reject" ? "reject" : actionRaw === "accept" ? "accept" : null;
  if (!action) {
    return NextResponse.json({ error: "Invalid action. Use accept or reject." }, { status: 400 });
  }

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  if (typeof body.cleanerId === "string" && body.cleanerId.trim() && body.cleanerId.trim() !== session.cleanerId) {
    return NextResponse.json({ error: "Cleaner mismatch." }, { status: 403 });
  }

  const { data: row, error: rowErr } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  if (rowErr || !row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  const rec = row as {
    id?: string;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    team_id?: string | null;
    is_team_job?: boolean | null;
  };
  const canAccess = await cleanerHasBookingAccess(admin, session.cleanerId, {
    id: bookingId,
    cleaner_id: rec.cleaner_id ?? null,
    payout_owner_cleaner_id: rec.payout_owner_cleaner_id ?? null,
    team_id: rec.team_id ?? null,
    is_team_job: rec.is_team_job === true,
  });
  if (!canAccess) {
    return NextResponse.json({ error: "Not your job." }, { status: 403 });
  }

  const out: RespondLifecycleHttpResult =
    action === "reject"
      ? gatewayLifecycleOpToResult(
          await cleanerRejectBooking({
            admin,
            cleanerId: session.cleanerId,
            bookingId,
          }),
        )
      : gatewayLifecycleOpToResult(
          await cleanerAcceptBooking({
            admin,
            cleanerId: session.cleanerId,
            bookingId,
          }),
        );
  return NextResponse.json(out.json, { status: out.status });
}
