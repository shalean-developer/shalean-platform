import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
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

  const { error: createError } = await admin.auth.admin.createUser({
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
