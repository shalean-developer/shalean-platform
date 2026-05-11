import { normalizeEmail } from "@/lib/booking/normalizeEmail";

const AUTH_USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WidgetDraftOwnershipInput = {
  /** Server-verified auth user id (e.g. Supabase `auth.users`). */
  authUserId?: string | null;
  /** Server-verified email from the same session as `authUserId`. */
  authEmail?: string | null;
  /**
   * Form / handoff email. For **guest** creates this becomes `customer_email` when valid.
   * For **authenticated** creates, used only when the auth record has no email (rare).
   */
  guestEmail?: string | null;
};

export type WidgetDraftOwnershipResolved = {
  user_id: string | null;
  customer_email: string | null;
};

/**
 * Minimal ownership for `homepage_widget` draft rows. Never sets `user_id` from email alone.
 */
export function resolveWidgetDraftBookingOwnership(
  input: WidgetDraftOwnershipInput,
): WidgetDraftOwnershipResolved {
  const authUidRaw = input.authUserId != null ? String(input.authUserId).trim() : "";
  const authEmailNorm = normalizeEmail(String(input.authEmail ?? ""));
  const guestNorm = normalizeEmail(String(input.guestEmail ?? ""));

  if (authUidRaw && AUTH_USER_ID_RE.test(authUidRaw)) {
    const email =
      authEmailNorm.length >= 3
        ? authEmailNorm
        : guestNorm.length >= 3
          ? guestNorm
          : null;
    return { user_id: authUidRaw, customer_email: email };
  }

  return {
    user_id: null,
    customer_email: guestNorm.length >= 3 ? guestNorm : null,
  };
}
