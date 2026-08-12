import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveUserRoleServer } from "@/lib/auth/resolveUserRoleServer";
import {
  generateOfficeEmailCode,
  hashOfficeEmailCode,
  OFFICE_CODE_MAX_ATTEMPTS,
  OFFICE_CODE_RESEND_COOLDOWN_MS,
  OFFICE_CODE_TTL_MS,
} from "@/lib/auth/officeEmailVerification";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { assertNotSeedEmail } from "@/lib/seed/devSeedGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your management email";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
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

  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await publicClient.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.id || !user.email) {
    return NextResponse.json({ ok: false, error: "Invalid or expired session." }, { status: 401 });
  }

  const resolved = await resolveUserRoleServer(admin, { userId: user.id, email: user.email });
  if (resolved.kind !== "ok" || resolved.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  // Repository-wide outbound safety: development/staging seed identities must never
  // reach Resend or another real provider. In production this guard is a no-op.
  try {
    assertNotSeedEmail(user.email, "office-email-verification");
  } catch (seedRecipientError) {
    console.warn("[office-email-verification] blocked seed recipient", {
      userId: user.id,
      email: user.email,
      error: seedRecipientError instanceof Error ? seedRecipientError.message : "seed recipient blocked",
    });
    return NextResponse.json(
      { ok: false, error: "Security-code email is disabled for development seed accounts." },
      { status: 409 },
    );
  }

  const { data: latest, error: latestError } = await admin
    .from("office_email_verification_challenges")
    .select("id, sent_at")
    .eq("user_id", user.id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    console.error("[office-email-verification] challenge lookup failed", latestError.code);
    return NextResponse.json({ ok: false, error: "Verification service unavailable." }, { status: 503 });
  }

  if (latest?.sent_at) {
    const elapsed = Date.now() - new Date(latest.sent_at).getTime();
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < OFFICE_CODE_RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((OFFICE_CODE_RESEND_COOLDOWN_MS - elapsed) / 1000);
      return NextResponse.json(
        { ok: false, error: "Please wait before requesting another code.", retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }
  }

  const code = generateOfficeEmailCode();
  const challengeId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OFFICE_CODE_TTL_MS);
  const codeHash = hashOfficeEmailCode(user.id, challengeId, code);

  await admin
    .from("office_email_verification_challenges")
    .update({ consumed_at: now.toISOString() })
    .eq("user_id", user.id)
    .is("consumed_at", null);

  const { error: insertError } = await admin.from("office_email_verification_challenges").insert({
    id: challengeId,
    user_id: user.id,
    code_hash: codeHash,
    expires_at: expiresAt.toISOString(),
    attempt_count: 0,
    max_attempts: OFFICE_CODE_MAX_ATTEMPTS,
    sent_at: now.toISOString(),
  });
  if (insertError) {
    console.error("[office-email-verification] challenge insert failed", insertError.code);
    return NextResponse.json({ ok: false, error: "Verification service unavailable." }, { status: 503 });
  }

  const resend = getResend();
  if (!resend) {
    await admin.from("office_email_verification_challenges").delete().eq("id", challengeId);
    return NextResponse.json({ ok: false, error: "Email service is not configured." }, { status: 503 });
  }

  const { error: emailError } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: user.email,
    subject: "Your Shalean Office security code",
    text: `Your Shalean Office security code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827"><h2 style="margin:0 0 12px">Shalean Office security code</h2><p>Use this code to continue to Shalean Office:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p><p style="color:#6b7280">This code expires in 10 minutes and can only be used once.</p><p style="color:#6b7280">If you did not request this code, you can ignore this email.</p></div>`,
  });

  if (emailError) {
    await admin.from("office_email_verification_challenges").delete().eq("id", challengeId);
    console.error("[office-email-verification] Resend failed", emailError.message);
    return NextResponse.json({ ok: false, error: "Could not send the security code." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    email: maskEmail(user.email),
    expiresInSeconds: Math.floor(OFFICE_CODE_TTL_MS / 1000),
    resendAfterSeconds: Math.floor(OFFICE_CODE_RESEND_COOLDOWN_MS / 1000),
  });
}
