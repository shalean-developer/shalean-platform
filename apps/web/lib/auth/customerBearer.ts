import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type CustomerSession = { userId: string; email: string | undefined };

export async function requireCustomerSession(request: Request): Promise<
  { ok: true; session: CustomerSession } | { ok: false; response: NextResponse }
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

  if (userErr || !user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  }

  return { ok: true, session: { userId: user.id, email: user.email ?? undefined } };
}
