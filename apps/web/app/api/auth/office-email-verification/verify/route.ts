import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveUserRoleServer } from "@/lib/auth/resolveUserRoleServer";
import {
  createOfficeVerificationToken,
  OFFICE_VERIFICATION_COOKIE,
  officeSessionBinding,
  officeVerificationCookieOptions,
  verifyOfficeEmailCodeHash,
} from "@/lib/auth/officeEmailVerification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { code?: string };

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = getSupabaseAdmin();
  if (!url || !anon || !admin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 503 });
  }

  const token = bearerToken(request);
  if (!token) return NextResponse.json({ ok: false, error: "Missing authorization." }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const code = String(body.code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "Enter the 6-digit security code." }, { status: 400 });
  }

  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await publicClient.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ ok: false, error: "Invalid or expired session." }, { status: 401 });
  }

  const sessionBinding = officeSessionBinding(user.last_sign_in_at);
  if (!sessionBinding) {
    return NextResponse.json({ ok: false, error: "Could not bind verification to this login session." }, { status: 401 });
  }

  const resolved = await resolveUserRoleServer(admin, { userId: user.id, email: user.email });
  if (resolved.kind !== "ok" || resolved.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  const { data: challenge, error: challengeError } = await admin
    .from("office_email_verification_challenges")
    .select("id, code_hash, expires_at, attempt_count, max_attempts, consumed_at")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (challengeError) {
    console.error("[office-email-verification] verification lookup failed", challengeError.code);
    return NextResponse.json({ ok: false, error: "Verification service unavailable." }, { status: 503 });
  }
  if (!challenge) {
    return NextResponse.json({ ok: false, error: "Request a new security code." }, { status: 400 });
  }

  const now = Date.now();
  const expiresAt = new Date(challenge.expires_at).getTime();
  const attempts = Number(challenge.attempt_count ?? 0);
  const maxAttempts = Number(challenge.max_attempts ?? 5);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || attempts >= maxAttempts) {
    await admin
      .from("office_email_verification_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challenge.id);
    return NextResponse.json({ ok: false, error: "This code has expired. Request a new code." }, { status: 400 });
  }

  // Serialize guesses before checking the code. Only one request can claim the
  // current attempt_count value; concurrent requests lose the race and are rejected
  // without evaluating another guess.
  const nextAttempts = attempts + 1;
  const { data: claimedAttempt, error: claimError } = await admin
    .from("office_email_verification_challenges")
    .update({ attempt_count: nextAttempts })
    .eq("id", challenge.id)
    .eq("user_id", user.id)
    .eq("attempt_count", attempts)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("[office-email-verification] attempt claim failed", claimError.code);
    return NextResponse.json({ ok: false, error: "Verification service unavailable." }, { status: 503 });
  }
  if (!claimedAttempt) {
    return NextResponse.json(
      { ok: false, error: "Another verification attempt was processed. Try again." },
      { status: 409 },
    );
  }

  const matches = verifyOfficeEmailCodeHash(user.id, challenge.id, code, String(challenge.code_hash ?? ""));
  if (!matches) {
    if (nextAttempts >= maxAttempts) {
      await admin
        .from("office_email_verification_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challenge.id)
        .is("consumed_at", null);
    }
    return NextResponse.json(
      { ok: false, error: nextAttempts >= maxAttempts ? "Too many attempts. Request a new code." : "That security code is not correct." },
      { status: 400 },
    );
  }

  const consumedAt = new Date().toISOString();
  const { data: consumedChallenge, error: consumeError } = await admin
    .from("office_email_verification_challenges")
    .update({ consumed_at: consumedAt })
    .eq("id", challenge.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeError || !consumedChallenge) {
    console.error("[office-email-verification] challenge consume failed", consumeError?.code);
    return NextResponse.json({ ok: false, error: "Verification service unavailable." }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true, verified: true });
  const secure = new URL(request.url).protocol === "https:";
  response.cookies.set(
    OFFICE_VERIFICATION_COOKIE,
    createOfficeVerificationToken(user.id, sessionBinding),
    officeVerificationCookieOptions(secure),
  );
  return response;
}
