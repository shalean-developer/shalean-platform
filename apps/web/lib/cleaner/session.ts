import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveCleanerIdFromRequest(
  request: Request,
  admin: SupabaseClient,
): Promise<{ cleanerId: string | null; error?: string; status?: number }> {
  const directCleanerId = request.headers.get("x-cleaner-id")?.trim() ?? "";
  if (directCleanerId) {
    const { data: cleaner } = await admin.from("cleaners").select("id").eq("id", directCleanerId).maybeSingle();
    if (!cleaner) return { cleanerId: null, error: "Invalid cleaner session.", status: 401 };
    return { cleanerId: directCleanerId };
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { cleanerId: null, error: "Missing cleaner session.", status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { cleanerId: null, error: "Server configuration error.", status: 503 };

  const pub = createClient(url, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) return { cleanerId: null, error: "Invalid or expired session.", status: 401 };

  const uid = userData.user.id;
  const { data: byAuth } = await admin.from("cleaners").select("id").eq("auth_user_id", uid).maybeSingle();
  if (byAuth?.id) return { cleanerId: byAuth.id };
  const { data: legacy } = await admin.from("cleaners").select("id").eq("id", uid).maybeSingle();
  if (!legacy?.id) return { cleanerId: null, error: "Not a cleaner account.", status: 403 };
  return { cleanerId: legacy.id };
}
