import { createClient } from "@supabase/supabase-js";

export type BookingRouteBearerAuthResult =
  | { kind: "anonymous" }
  | { kind: "authenticated"; userId: string; email: string | null }
  | { kind: "invalid_token"; status: number; message: string };

/**
 * Optional Supabase session via `Authorization: Bearer <jwt>` (same pattern as `/api/customer/bookings`).
 * Missing header → anonymous; invalid token → error (caller returns 401/503).
 */
export async function resolveBookingRouteBearerAuth(request: Request): Promise<BookingRouteBearerAuthResult> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { kind: "anonymous" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { kind: "invalid_token", status: 503, message: "Server configuration error." };
  }

  const pub = createClient(url, anon);
  const { data, error } = await pub.auth.getUser(token);
  if (error || !data.user?.id) {
    return { kind: "invalid_token", status: 401, message: "Invalid or expired session." };
  }

  return {
    kind: "authenticated",
    userId: data.user.id,
    email: typeof data.user.email === "string" ? data.user.email : null,
  };
}
