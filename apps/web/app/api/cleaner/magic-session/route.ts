import { NextResponse } from "next/server";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { sanitizeCleanerPostAuthRedirect } from "@/lib/cleaner/cleanerRedirect";
import {
  isCleanerJobMagicLinkSigningConfigured,
  verifyCleanerJobAccessToken,
} from "@/lib/cleaner/cleanerJobMagicLink";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";
import { allowCleanerMagicSessionRequest } from "@/lib/rateLimit/offerSmsTrackedLinkIpLimit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  if (!allowCleanerMagicSessionRequest(request)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(request.url);
  const b = String(url.searchParams.get("b") ?? "").trim();
  const t = String(url.searchParams.get("t") ?? "").trim();
  const nextPath = `/cleaner/jobs/${encodeURIComponent(b || "unknown")}`;

  if (!uuidRe.test(b) || !t) {
    return redirectToCleanerLogin(request, nextPath);
  }

  if (!isCleanerJobMagicLinkSigningConfigured()) {
    return redirectToCleanerLogin(request, `/cleaner/jobs/${encodeURIComponent(b)}`);
  }

  const payload = verifyCleanerJobAccessToken(t);
  if (!payload || payload.bid !== b) {
    return redirectToCleanerLogin(request, `/cleaner/jobs/${encodeURIComponent(b)}`);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const claimed = await tryClaimNotificationIdempotency(admin, {
    reference: `job_magic_jti:v1:${payload.jti}`,
    eventType: "cleaner_job_magic_session",
    channel: "in_app",
    bookingId: b,
  });
  if (!claimed) {
    void logSystemEvent({
      level: "info",
      source: "cleaner_job_magic_session_replay",
      message: "Magic job link replay or parallel open",
      context: { bookingId: b, cleanerId: payload.sub, jti_prefix: payload.jti.slice(0, 8) },
    });
    return redirectToCleanerLogin(request, `/cleaner/jobs/${encodeURIComponent(b)}`);
  }

  const { data: booking, error: bookErr } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, team_id, is_team_job")
    .eq("id", b)
    .maybeSingle();

  if (bookErr || !booking) {
    return redirectToCleanerLogin(request, `/cleaner/jobs/${encodeURIComponent(b)}`);
  }

  const access = await cleanerHasBookingAccess(admin, payload.sub, booking as never);
  if (!access) {
    void logSystemEvent({
      level: "warn",
      source: "cleaner_job_magic_session_denied",
      message: "Magic job link cleaner cannot access booking",
      context: { bookingId: b, cleanerId: payload.sub },
    });
    return redirectToCleanerLogin(request, `/cleaner/jobs/${encodeURIComponent(b)}`);
  }

  const { data: cleaner, error: clErr } = await admin
    .from("cleaners")
    .select("email, auth_user_id")
    .eq("id", payload.sub)
    .maybeSingle();

  const email = String((cleaner as { email?: string | null } | null)?.email ?? "")
    .trim()
    .toLowerCase();
  const authUserId = String((cleaner as { auth_user_id?: string | null } | null)?.auth_user_id ?? "").trim();

  if (clErr || !email || !authUserId) {
    return redirectToCleanerLogin(request, `/cleaner/jobs/${encodeURIComponent(b)}`);
  }

  const redirectTo = `${getPublicAppUrlBase()}/cleaner/jobs/${encodeURIComponent(b)}`;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });

  const actionLink = linkData?.properties?.action_link;
  if (linkErr || !actionLink) {
    void logSystemEvent({
      level: "warn",
      source: "cleaner_job_magic_session_generate_link",
      message: linkErr?.message ?? "No action_link from Auth",
      context: { bookingId: b, cleanerId: payload.sub },
    });
    return redirectToCleanerLogin(request, `/cleaner/jobs/${encodeURIComponent(b)}`);
  }

  void logSystemEvent({
    level: "info",
    source: "cleaner_job_magic_session_ok",
    message: "Redirecting cleaner to Supabase magic link",
    context: { bookingId: b, cleanerId: payload.sub },
  });

  return NextResponse.redirect(actionLink, 302);
}

function redirectToCleanerLogin(request: Request, rawNext: string): NextResponse {
  const login = new URL("/cleaner/login", request.url);
  login.searchParams.set("redirect", sanitizeCleanerPostAuthRedirect(rawNext));
  return NextResponse.redirect(login, 302);
}
