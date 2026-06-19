import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchCheckConfig, LaunchCheckConfigResolved, LaunchCheckConfigSource } from "@/lib/launch/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readUuidEnv(key: string): string | null {
  const raw = process.env[key]?.trim() ?? "";
  return UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

function sourceFor(value: string | null, fromEnv: boolean, fromSession = false): LaunchCheckConfigSource {
  if (value) return fromEnv ? "env" : fromSession ? "session" : "discovered";
  return "missing";
}

export function isLaunchCheckEnabled(): boolean {
  const isProd =
    process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (!isProd) return true;
  return process.env.ENABLE_LAUNCH_CHECK === "true";
}

async function resolveCleanerAuthUserId(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<string | null> {
  const { data: cleanerRow } = await admin
    .from("cleaners")
    .select("auth_user_id, id")
    .eq("id", cleanerId)
    .maybeSingle();
  const authUserId = String(
    (cleanerRow as { auth_user_id?: string | null } | null)?.auth_user_id ?? "",
  ).trim();
  if (UUID_RE.test(authUserId)) return authUserId.toLowerCase();
  const legacyId = String((cleanerRow as { id?: string } | null)?.id ?? "").trim();
  return UUID_RE.test(legacyId) ? legacyId.toLowerCase() : null;
}

async function discoverCustomerUserId(admin: SupabaseClient): Promise<string | null> {
  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("role", "customer")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const profileId = String((profile as { id?: string } | null)?.id ?? "").trim().toLowerCase();
  if (UUID_RE.test(profileId)) return profileId;

  const { data: booking } = await admin
    .from("bookings")
    .select("user_id")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const bookingUserId = String((booking as { user_id?: string | null }).user_id ?? "")
    .trim()
    .toLowerCase();
  return UUID_RE.test(bookingUserId) ? bookingUserId : null;
}

async function discoverCleanerIds(
  admin: SupabaseClient,
): Promise<{ cleanerId: string | null; cleanerUserId: string | null }> {
  const { data: linked } = await admin
    .from("cleaners")
    .select("id, auth_user_id")
    .not("auth_user_id", "is", null)
    .order("total_jobs", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linked) {
    const cleanerId = String((linked as { id?: string }).id ?? "").trim().toLowerCase();
    const authUserId = String((linked as { auth_user_id?: string | null }).auth_user_id ?? "")
      .trim()
      .toLowerCase();
    if (UUID_RE.test(cleanerId)) {
      return {
        cleanerId,
        cleanerUserId: UUID_RE.test(authUserId) ? authUserId : cleanerId,
      };
    }
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("role", "cleaner")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cleanerUserId = String((profile as { id?: string } | null)?.id ?? "").trim().toLowerCase();
  if (!UUID_RE.test(cleanerUserId)) return { cleanerId: null, cleanerUserId: null };

  const { data: byAuth } = await admin
    .from("cleaners")
    .select("id")
    .eq("auth_user_id", cleanerUserId)
    .maybeSingle();
  const cleanerId = String((byAuth as { id?: string } | null)?.id ?? "").trim().toLowerCase();
  if (UUID_RE.test(cleanerId)) return { cleanerId, cleanerUserId };

  const { data: legacy } = await admin.from("cleaners").select("id").eq("id", cleanerUserId).maybeSingle();
  const legacyId = String((legacy as { id?: string } | null)?.id ?? "").trim().toLowerCase();
  return UUID_RE.test(legacyId) ? { cleanerId: legacyId, cleanerUserId } : { cleanerId: null, cleanerUserId };
}

async function resolveAdminUserIdFromEmail(
  admin: SupabaseClient,
  adminEmail: string,
): Promise<string | null> {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const match = (users?.users ?? []).find(
    (u) => String(u.email ?? "").trim().toLowerCase() === adminEmail.toLowerCase(),
  );
  if (match?.id && UUID_RE.test(match.id)) return match.id.toLowerCase();
  return null;
}

export async function readLaunchCheckConfig(
  admin: SupabaseClient,
  options?: {
    requestingAdminUserId?: string | null;
    requestingAdminEmail?: string | null;
  },
): Promise<LaunchCheckConfigResolved> {
  const customerFromEnv = readUuidEnv("LAUNCH_CHECK_CUSTOMER_USER_ID");
  const cleanerFromEnv = readUuidEnv("LAUNCH_CHECK_CLEANER_ID");
  let cleanerUserFromEnv = readUuidEnv("LAUNCH_CHECK_CLEANER_USER_ID");
  let adminFromEnv = readUuidEnv("LAUNCH_CHECK_ADMIN_USER_ID");
  const adminEmail = process.env.LAUNCH_CHECK_ADMIN_EMAIL?.trim() || null;

  let customerUserId = customerFromEnv;
  let cleanerId = cleanerFromEnv;
  let cleanerUserId = cleanerUserFromEnv;
  let adminUserId = adminFromEnv;

  if (cleanerId && !cleanerUserId) {
    cleanerUserId = await resolveCleanerAuthUserId(admin, cleanerId);
  }

  if (adminEmail && !adminUserId) {
    adminUserId = await resolveAdminUserIdFromEmail(admin, adminEmail);
  }

  const sessionAdminId = String(options?.requestingAdminUserId ?? "").trim().toLowerCase();
  const sessionAdminEmail = String(options?.requestingAdminEmail ?? "").trim() || null;

  if (!customerUserId) {
    customerUserId = await discoverCustomerUserId(admin);
  }

  if (!cleanerId || !cleanerUserId) {
    const discovered = await discoverCleanerIds(admin);
    if (!cleanerId) cleanerId = discovered.cleanerId;
    if (!cleanerUserId) cleanerUserId = discovered.cleanerUserId;
  }

  if (!adminUserId && UUID_RE.test(sessionAdminId)) {
    adminUserId = sessionAdminId;
  }

  if (!adminUserId && sessionAdminEmail) {
    adminUserId = await resolveAdminUserIdFromEmail(admin, sessionAdminEmail);
  }

  return {
    customerUserId,
    cleanerId,
    cleanerUserId,
    adminUserId,
    adminEmail: adminEmail ?? sessionAdminEmail,
    sources: {
      customerUserId: sourceFor(customerUserId, Boolean(customerFromEnv)),
      cleanerId: sourceFor(cleanerId, Boolean(cleanerFromEnv)),
      cleanerUserId: sourceFor(
        cleanerUserId,
        Boolean(cleanerUserFromEnv) || (Boolean(cleanerFromEnv) && Boolean(cleanerUserId)),
      ),
      adminUserId: sourceFor(
        adminUserId,
        Boolean(adminFromEnv) || Boolean(adminEmail),
        Boolean(adminUserId) && UUID_RE.test(sessionAdminId) && adminUserId === sessionAdminId,
      ),
    },
  };
}

export function buildLaunchCheckSetupHints(config: LaunchCheckConfigResolved): string[] {
  const hints: string[] = [];
  if (!config.customerUserId) {
    hints.push("No customer account found — create a customer user or set LAUNCH_CHECK_CUSTOMER_USER_ID.");
  }
  if (!config.adminUserId) {
    hints.push("Admin user id missing — sign in as admin or set LAUNCH_CHECK_ADMIN_USER_ID / LAUNCH_CHECK_ADMIN_EMAIL.");
  }
  if (!config.cleanerId || !config.cleanerUserId) {
    hints.push("No linked cleaner found — link a cleaner auth account or set LAUNCH_CHECK_CLEANER_ID.");
  }
  if (config.sources.customerUserId === "discovered") {
    hints.push("Using auto-discovered customer account (set LAUNCH_CHECK_CUSTOMER_USER_ID to pin a specific user).");
  }
  if (config.sources.cleanerId === "discovered") {
    hints.push("Using auto-discovered cleaner (set LAUNCH_CHECK_CLEANER_ID to pin a specific cleaner).");
  }
  return hints;
}

export function isLaunchCheckConfigReady(config: LaunchCheckConfig): boolean {
  return Boolean(config.customerUserId && config.adminUserId);
}
