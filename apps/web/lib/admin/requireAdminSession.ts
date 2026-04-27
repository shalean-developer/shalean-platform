import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";

export type AdminSessionUser = { id: string; email: string };

/**
 * Validates `Authorization: Bearer <supabase access token>` and returns the user when email is allowlisted admin.
 */
export async function requireAdminSession(request: Request): Promise<
  { ok: true; user: AdminSessionUser } | { ok: false; response: NextResponse }
> {
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

  if (userErr || !user?.email || !user.id) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  }

  if (!isAdmin(user.email)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { ok: true, user: { id: user.id, email: user.email } };
}
