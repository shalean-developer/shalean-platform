import { NextResponse } from "next/server";
import { deleteUserPushToken, upsertUserPushToken } from "@/lib/customer/customerPushTokens";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Register an Expo push token for the signed-in cleaner.
 * Body: { token: string, platform?: string }
 * user_id always from JWT (authUserId) — never from body.
 */
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  delete body.user_id;
  delete body.userId;
  delete body.cleaner_id;
  delete body.cleanerId;

  const token = typeof body.token === "string" ? body.token : "";
  const platform = typeof body.platform === "string" ? body.platform : null;

  const result = await upsertUserPushToken(admin, {
    userId: session.authUserId,
    token,
    platform,
    app: "cleaner",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, app: "cleaner" });
}

/** Unregister a push token for the signed-in cleaner. Body: { token: string } */
export async function DELETE(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const result = await deleteUserPushToken(admin, session.authUserId, token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
