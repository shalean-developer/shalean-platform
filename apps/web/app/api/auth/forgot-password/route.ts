import { NextResponse } from "next/server";

import { sendPasswordResetEmail } from "@/lib/auth/sendPasswordResetEmail";
import {
  allowPasswordResetRequest,
  passwordResetRateLimitKey,
} from "@/lib/rateLimit/passwordResetIpLimit";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: string };

export async function POST(request: Request) {
  if (!allowPasswordResetRequest(passwordResetRateLimitKey(request))) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const result = await sendPasswordResetEmail(admin, email);

  if (!result.ok && result.reason === "no_user") {
    return NextResponse.json({ sent: false, code: "no_account" });
  }

  if (!result.ok) {
    void logSystemEvent({
      level: "warn",
      source: "auth/password_reset",
      message: "password_reset_delivery_failed",
      context: { email, reason: result.reason },
    });
    if (result.reason === "production_redirect") {
      return NextResponse.json(
        { error: "Password reset is misconfigured for this environment. Contact support." },
        { status: 503 },
      );
    }
    if (result.reason === "rate_limited") {
      return NextResponse.json(
        { error: "Please wait a minute before requesting another reset email." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "We could not send the reset email. Try again in a few minutes." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
