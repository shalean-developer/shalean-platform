import type { SupabaseClient } from "@supabase/supabase-js";

export const CUSTOMER_NOTIFICATION_SELECT =
  "id, user_id, title, body, type, read_at, created_at, booking_id";

export type CustomerNotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  read_at: string | null;
  created_at: string;
  booking_id?: string | null;
};

export async function listCustomerNotifications(
  admin: SupabaseClient,
  userId: string,
  limit = 100,
): Promise<{ ok: true; notifications: CustomerNotificationRow[] } | { ok: false; error: string }> {
  const capped = Math.min(Math.max(1, limit), 200);
  const { data, error } = await admin
    .from("user_notifications")
    .select(CUSTOMER_NOTIFICATION_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(capped);

  if (error) return { ok: false, error: error.message };
  return { ok: true, notifications: (data as CustomerNotificationRow[]) ?? [] };
}

export async function markCustomerNotificationRead(
  admin: SupabaseClient,
  userId: string,
  opts: { id?: string; all?: boolean },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const now = new Date().toISOString();

  if (opts.all) {
    const { error } = await admin
      .from("user_notifications")
      .update({ read_at: now })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) return { ok: false, error: error.message, status: 500 };
    return { ok: true };
  }

  const id = typeof opts.id === "string" ? opts.id.trim() : "";
  if (!id) return { ok: false, error: "id or all required.", status: 400 };

  const { data: row, error: selErr } = await admin
    .from("user_notifications")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message, status: 500 };
  if (!row) return { ok: false, error: "Not found.", status: 404 };
  if (String((row as { user_id?: string }).user_id) !== userId) {
    return { ok: false, error: "Not found.", status: 404 };
  }

  const { error } = await admin
    .from("user_notifications")
    .update({ read_at: now })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true };
}
