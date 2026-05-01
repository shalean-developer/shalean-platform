import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/auth/admin";

export async function requireAdminRequest(
  request: Request,
): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) return { ok: false, status: 403, error: "Forbidden." };
  return { ok: true, email: user.email };
}
