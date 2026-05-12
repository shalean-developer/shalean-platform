import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ensureUserProfileForAuthUser } from "@/lib/admin/ensureUserProfileForAuthUser";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Guest upgrade: ensure an Auth user exists, then send a magic link (no password).
 * Requires a persisted guest booking row so emails cannot be targeted blindly.
 */
export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const emailRaw = typeof b.email === "string" ? b.email.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const reference = typeof b.reference === "string" ? b.reference.trim() : "";

  if (!reference) {
    return NextResponse.json({ error: "Missing booking reference." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }
  if (name.length < 2) {
    return NextResponse.json({ error: "Invalid name." }, { status: 400 });
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, customer_email, user_id")
    .eq("paystack_reference", reference)
    .maybeSingle();

  if (bookingErr) {
    await reportOperationalIssue("error", "create-from-guest", `booking lookup: ${bookingErr.message}`);
    return NextResponse.json({ error: "Could not verify booking." }, { status: 500 });
  }

  if (!booking) {
    return NextResponse.json(
      {
        error:
          "We couldn’t find this booking yet. Wait a few seconds after payment, then try again.",
      },
      { status: 404 },
    );
  }

  const rowEmail = typeof booking.customer_email === "string" ? booking.customer_email.trim() : "";
  if (!rowEmail || rowEmail.toLowerCase() !== emailRaw.toLowerCase()) {
    return NextResponse.json({ error: "Email does not match this booking." }, { status: 403 });
  }

  if (booking.user_id) {
    return NextResponse.json({ error: "This booking is already linked to an account." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Auth is not configured." }, { status: 503 });
  }

  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email: rowEmail,
    email_confirm: true,
    user_metadata: { full_name: name, name },
  });

  if (createError) {
    const msg = createError.message ?? "";
    const already =
      /already|registered|exists/i.test(msg) ||
      (createError as { code?: string }).code === "email_exists";
    if (!already) {
      await reportOperationalIssue("error", "create-from-guest", `createUser: ${msg}`);
      return NextResponse.json({ error: msg || "Could not create account." }, { status: 400 });
    }
  }

  /*
   * H-6 / H-4 — auth/profile convergence.
   *
   * Auth users created here have historically been left without a
   * `user_profiles` row until they first signed in (`apps/web/lib/auth/authClient.ts`).
   * For guest-upgrade users that never reach the in-app sign-in path, this
   * left them as "orphan" auth users, which the recurring cron silently
   * defaulted to `per_booking`. We close the gap server-side: as soon as
   * the auth user is known to exist (whether we just minted them or they
   * already existed), make sure `user_profiles` has a default row.
   *
   * Failure here is logged but not fatal — the magic-link send (and the
   * customer's recovery flow) is the user-visible path; profile repair is
   * a background invariant. The one-shot backfill migration handles any
   * historical rows; this hook prevents new orphans.
   */
  let resolvedAuthUserId = createData?.user?.id ?? null;
  if (!resolvedAuthUserId) {
    const normalized = normalizeEmail(rowEmail);
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 50,
    });
    if (!listErr && list?.users) {
      const match = list.users.find(
        (u) => typeof u.email === "string" && normalizeEmail(u.email) === normalized,
      );
      resolvedAuthUserId = match?.id ?? null;
    }
  }
  if (resolvedAuthUserId) {
    const ensured = await ensureUserProfileForAuthUser(admin, resolvedAuthUserId);
    if ("error" in ensured) {
      await logSystemEvent({
        level: "warn",
        source: "create-from-guest",
        message: "user_profile_repair_failed",
        context: { auth_user_id: resolvedAuthUserId, error: ensured.error },
      });
    } else if (ensured.created) {
      await logSystemEvent({
        level: "info",
        source: "create-from-guest",
        message: "user_profile_created",
        context: { auth_user_id: resolvedAuthUserId },
      });
    }
  }

  const appUrl = getPublicAppUrlBase();
  const emailRedirectTo = `${appUrl}/auth/callback`;

  const pub = createClient(url, anon);
  const { error: otpError } = await pub.auth.signInWithOtp({
    email: rowEmail,
    options: {
      emailRedirectTo,
      shouldCreateUser: false,
    },
  });

  if (otpError) {
    await reportOperationalIssue("error", "create-from-guest", `signInWithOtp: ${otpError.message}`);
    return NextResponse.json(
      { error: otpError.message || "Could not send sign-in email." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
