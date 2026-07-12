import { getCookieUser } from "@/lib/auth/getCookieUser";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";

export type CustomerRequestUser = {
  id: string;
  email: string | null;
  /** Present when auth came from Bearer — needed for Auth metadata updates. */
  accessToken: string | null;
};

/**
 * Cookie (web `<a href>`) or Bearer (mobile) customer identity.
 * Invalid Bearer → error; missing both → null (caller returns 401).
 */
export async function resolveCustomerRequestUser(
  request: Request,
): Promise<
  | { ok: true; user: CustomerRequestUser }
  | { ok: false; status: number; error: string }
  | { ok: true; user: null }
> {
  const authHeader = request.headers.get("authorization");
  const hasBearer = Boolean(authHeader?.replace(/^Bearer\s+/i, "").trim());

  if (hasBearer) {
    const bearer = await resolveBookingRouteBearerAuth(request);
    if (bearer.kind === "invalid_token") {
      return { ok: false, status: bearer.status, error: bearer.message };
    }
    if (bearer.kind === "authenticated") {
      const token = authHeader!.replace(/^Bearer\s+/i, "").trim();
      return {
        ok: true,
        user: { id: bearer.userId, email: bearer.email, accessToken: token },
      };
    }
  }

  const cookieUser = await getCookieUser();
  if (cookieUser?.id) {
    return {
      ok: true,
      user: {
        id: cookieUser.id,
        email: cookieUser.email ?? null,
        accessToken: null,
      },
    };
  }

  return { ok: true, user: null };
}
