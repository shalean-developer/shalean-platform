import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";

export type AdminAuthResult =
  | { ok: true; user: User; email: string }
  | { ok: false; response: NextResponse };

/**
 * Validates Bearer JWT and admin email allow-list.
 */
export async function requireAdminFromRequest(request: Request): Promise<AdminAuthResult> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization." }, { status: 401 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, response: NextResponse.json({ error: "Server configuration error." }, { status: 503 }) };
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);

  if (userErr || !user?.email) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  }

  if (!isAdmin(user.email)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { ok: true, user, email: user.email };
}
