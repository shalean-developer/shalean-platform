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

/** Always returns generic success to avoid account enumeration. */
export async function POST(request: Request) {
  if (!allowPasswordResetRequest(passwordResetRateLimitKey(request))) {
    return NextResponse.json({ ok: true });
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

  if (!result.ok && result.reason !== "no_user") {
    void logSystemEvent({
      level: "warn",
      source: "auth/password_reset",
      message: "password_reset_delivery_failed",
      context: { email, reason: result.reason },
    });
  }

  return NextResponse.json({ ok: true });
}
