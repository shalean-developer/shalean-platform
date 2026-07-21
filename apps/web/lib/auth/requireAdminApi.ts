import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";

export async function requireAdminApi(
  request: Request,
): Promise<{ ok: true; userId: string; email: string } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.id) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }

  return requireAdminUser(user);
}
