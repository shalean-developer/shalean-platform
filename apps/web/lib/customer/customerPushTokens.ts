import type { SupabaseClient } from "@supabase/supabase-js";

const EXPO_TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_\-]+\]$/;

export function isValidExpoPushToken(token: string): boolean {
  const t = token.trim();
  if (t.length < 16 || t.length > 512) return false;
  // Accept classic Expo format; also allow raw FCM/APNs-looking tokens for future.
  if (EXPO_TOKEN_RE.test(t)) return true;
  return /^[A-Za-z0-9_\-.:]+$/.test(t) && t.length >= 20;
}

export type UpsertPushTokenInput = {
  userId: string;
  token: string;
  platform?: string | null;
  app?: "customer" | "cleaner";
};

export async function upsertUserPushToken(
  admin: SupabaseClient,
  input: UpsertPushTokenInput,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const token = input.token.trim();
  if (!isValidExpoPushToken(token)) {
    return { ok: false, error: "Invalid push token.", status: 400 };
  }
  const app = input.app === "cleaner" ? "cleaner" : "customer";
  const platform =
    typeof input.platform === "string" && input.platform.trim()
      ? input.platform.trim().slice(0, 32).toLowerCase()
      : null;
  const now = new Date().toISOString();

  const { data: existing, error: selErr } = await admin
    .from("user_push_tokens")
    .select("id")
    .eq("user_id", input.userId)
    .eq("token", token)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message, status: 500 };

  if (existing) {
    const { error } = await admin
      .from("user_push_tokens")
      .update({ platform, app, updated_at: now })
      .eq("id", (existing as { id: string }).id)
      .eq("user_id", input.userId);
    if (error) return { ok: false, error: error.message, status: 500 };
    return { ok: true };
  }

  const { error } = await admin.from("user_push_tokens").insert({
    user_id: input.userId,
    token,
    platform,
    app,
    updated_at: now,
  });
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true };
}

export async function deleteUserPushToken(
  admin: SupabaseClient,
  userId: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const t = token.trim();
  if (!t) return { ok: false, error: "token required.", status: 400 };

  const { data, error } = await admin
    .from("user_push_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("token", t)
    .select("id");

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data?.length) return { ok: false, error: "Not found.", status: 404 };
  return { ok: true };
}
