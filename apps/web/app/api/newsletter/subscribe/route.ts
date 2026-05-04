import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Public marketing newsletter signup — persists to `newsletter_subscribers` (service role).
 */
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Service temporarily unavailable. Please try again later." }, { status: 503 });
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email ?? ""));
  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const { error } = await admin.from("newsletter_subscribers").insert({
    email,
    source: "marketing_footer",
  });

  if (error) {
    // Unique violation — already subscribed; respond success to avoid leaking membership.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true });
    }
    console.error("[newsletter/subscribe]", error.message);
    return NextResponse.json({ error: "Could not save your subscription. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
