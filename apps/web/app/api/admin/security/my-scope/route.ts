import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getEffectiveAdminScope } from "@/lib/admin/effectiveAdminScope";

export const dynamic = "force-dynamic";

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const publicClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await publicClient.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const { scope, error } = await getEffectiveAdminScope(adminClient, user.id);
  if (error || !scope) {
    console.error("Admin scope resolution failed", { userId: user.id });
    return NextResponse.json({ error: "Scope resolution unavailable." }, { status: 503 });
  }

  return NextResponse.json(scope);
}
