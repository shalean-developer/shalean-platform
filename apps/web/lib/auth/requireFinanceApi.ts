import "server-only";

import { createClient } from "@supabase/supabase-js";
import { canAccessFinance } from "@/lib/auth/finance";

export async function requireFinanceApi(
  request: Request,
): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; error: string }
> {
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
  if (userErr || !user?.email) return { ok: false, status: 403, error: "Forbidden." };

  const serviceKey =
    (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_KEY?.trim()) ?? "";
  let financeAccess = false;
  if (serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: profile } = await admin
      .from("user_profiles")
      .select("finance_access")
      .eq("id", user.id)
      .maybeSingle();
    financeAccess = profile?.finance_access === true;
  }

  if (!canAccessFinance(user.email, financeAccess)) {
    return { ok: false, status: 403, error: "Finance access required." };
  }

  return { ok: true, userId: user.id, email: user.email };
}
