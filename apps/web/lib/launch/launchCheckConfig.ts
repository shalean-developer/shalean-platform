import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchCheckConfig } from "@/lib/launch/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readUuidEnv(key: string): string | null {
  const raw = process.env[key]?.trim() ?? "";
  return UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

export function isLaunchCheckEnabled(): boolean {
  const isProd =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (!isProd) return true;
  return process.env.ENABLE_LAUNCH_CHECK === "true";
}

export async function readLaunchCheckConfig(
  admin: SupabaseClient,
): Promise<LaunchCheckConfig> {
  const customerUserId = readUuidEnv("LAUNCH_CHECK_CUSTOMER_USER_ID");
  const cleanerId = readUuidEnv("LAUNCH_CHECK_CLEANER_ID");
  let cleanerUserId = readUuidEnv("LAUNCH_CHECK_CLEANER_USER_ID");
  let adminUserId = readUuidEnv("LAUNCH_CHECK_ADMIN_USER_ID");
  const adminEmail = process.env.LAUNCH_CHECK_ADMIN_EMAIL?.trim() || null;

  if (cleanerId && !cleanerUserId) {
    const { data: cleanerRow } = await admin
      .from("cleaners")
      .select("auth_user_id")
      .eq("id", cleanerId)
      .maybeSingle();
    const authUserId = String((cleanerRow as { auth_user_id?: string | null } | null)?.auth_user_id ?? "").trim();
    if (UUID_RE.test(authUserId)) cleanerUserId = authUserId.toLowerCase();
  }

  if (adminEmail && !adminUserId) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = (users?.users ?? []).find(
      (u) => String(u.email ?? "").trim().toLowerCase() === adminEmail.toLowerCase(),
    );
    if (match?.id && UUID_RE.test(match.id)) adminUserId = match.id.toLowerCase();
  }

  return {
    customerUserId,
    cleanerId,
    cleanerUserId,
    adminUserId,
    adminEmail,
  };
}
