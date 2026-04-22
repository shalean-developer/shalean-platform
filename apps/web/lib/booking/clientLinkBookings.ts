import { normalizeEmail } from "@/lib/booking/normalizeEmail";

/**
 * After password login/signup (and any caller of signIn/signUp), attaches `user_id` to rows
 * where `customer_email` matches and `user_id` is null. Uses `/api/bookings/link-user` (service role).
 */
export async function linkBookingsToUserAfterAuth(
  accessToken: string,
  user: { id: string; email?: string | null },
): Promise<void> {
  const raw = user.email?.trim();
  if (!accessToken || !raw) return;
  const email = normalizeEmail(raw);
  try {
    await fetch("/api/bookings/link-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, userId: user.id }),
    });
  } catch {
    /* ignore */
  }
}
