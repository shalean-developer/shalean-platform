import { createClient } from "@supabase/supabase-js";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";

export async function requireAdminRequest(
  request: Request,
): Promise<{ ok: true; email: string; userId: string } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };

  const pub = createClient(url, anon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const {
    data: { user },
    error,
  } = await pub.auth.getUser(token);

  if (error || !user) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }

  return requireAdminUser(user);
}
