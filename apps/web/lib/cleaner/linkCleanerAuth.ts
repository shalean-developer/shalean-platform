import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanerGeneratedLoginEmailFromAnyPhone } from "@/lib/cleaner/cleanerIdentity";
import { syncCleanerUserProfileForCleanerRow } from "@/lib/cleaner/syncCleanerUserProfile";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

const log = (...args: unknown[]) => console.error("[cleaner-auth-link]", ...args);

export type BackfillCleanerAuthResult = {
  scanned: number;
  missingAuth: number;
  linked: number;
  failed: number;
  failures: { cleanerId: string; message: string }[];
};

/** Candidate auth emails, most preferred first (deduped). */
export function resolveAuthEmailsForCleaner(row: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): string[] {
  const primary = String(row.email ?? "").trim().toLowerCase();
  const generated = row.phone ? cleanerGeneratedLoginEmailFromAnyPhone(String(row.phone)) : null;
  const canon = row.phone ? normalizeSouthAfricaPhone(String(row.phone)) : null;
  const digits = canon ? canon.replace(/\D/g, "") : String(row.phone ?? "").replace(/\D/g, "");
  const phoneLocal = digits ? `cleaner-${digits}@shalean.local`.toLowerCase() : null;
  const idLocal = `cleaner+${row.id}@shalean.local`.toLowerCase();
  const out: string[] = [];
  for (const e of [primary, generated, phoneLocal, idLocal]) {
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

/** Resolve an auth user id by exact email. Uses DB RPC on `auth.users` (reliable); then bookings; then listUsers. */
export async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;

  const { data: rpcData, error: rpcErr } = await admin.rpc("resolve_auth_user_id_by_email", { p_email: needle });
  if (!rpcErr && rpcData != null && typeof rpcData === "string" && /^[0-9a-f-]{36}$/i.test(rpcData)) {
    return rpcData;
  }
  if (rpcErr) {
    log("resolve_auth_user_id_by_email failed", rpcErr.message);
  }

  const { data: bookingRow } = await admin
    .from("bookings")
    .select("user_id")
    .eq("customer_email", needle)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fromBooking = bookingRow && typeof (bookingRow as { user_id?: unknown }).user_id === "string"
    ? (bookingRow as { user_id: string }).user_id
    : null;
  if (fromBooking && /^[0-9a-f-]{36}$/i.test(fromBooking)) {
    return fromBooking;
  }

  for (let page = 1; page < 40; page += 1) {
    const res = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (res.error) {
      log("listUsers failed", res.error.message);
      return null;
    }
    const hit = res.data.users.find((u) => (u.email ?? "").toLowerCase() === needle);
    if (hit?.id) return hit.id;
    if (res.data.users.length < 1000) break;
  }
  return null;
}

/** Returns cleaners.id that currently references this auth user, if any. */
async function cleanerIdClaimingAuthUser(admin: SupabaseClient, authUserId: string): Promise<string | null> {
  const { data } = await admin.from("cleaners").select("id").eq("auth_user_id", authUserId).maybeSingle();
  return data?.id ?? null;
}

async function authUserIsUsable(admin: SupabaseClient, authUserId: string): Promise<boolean> {
  const uid = String(authUserId ?? "").trim();
  if (!uid) return false;
  const check = await admin.auth.admin.getUserById(uid);
  return !check.error && Boolean(check.data.user?.id);
}

function fallbackCleanerAuthEmail(cleanerRowId: string): string {
  return ("cleaner+" + cleanerRowId + "@cleaner.shalean.com").toLowerCase();
}

function authCreationEmailCandidates(row: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): string[] {
  const candidates = [
    row.phone ? cleanerGeneratedLoginEmailFromAnyPhone(String(row.phone)) : null,
    String(row.email ?? "").trim().toLowerCase() || null,
    fallbackCleanerAuthEmail(row.id),
  ];
  return [...new Set(candidates.filter((value): value is string => Boolean(value)))];
}

async function finishCleanerAuthLink(admin: SupabaseClient, cleanerRowId: string, authUserId: string): Promise<string> {
  const synced = await syncCleanerUserProfileForCleanerRow(admin, cleanerRowId);
  if (!synced.ok) {
    log("profile sync failed", cleanerRowId, authUserId, synced.error);
  }
  return authUserId;
}

/**
 * Ensures the cleaner row has a valid `auth_user_id` pointing at a real Auth user.
 * Prefers: existing valid link → reuse by email → create user.
 * Never assigns an auth user already linked to a different cleaner row.
 */
export async function ensureCleanerLinkedToAuth(
  admin: SupabaseClient,
  cleanerRowId: string,
  options: { passwordForNewUser: string },
): Promise<string> {
  const { data: row, error: fetchErr } = await admin
    .from("cleaners")
    .select("id, email, full_name, phone, auth_user_id")
    .eq("id", cleanerRowId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!row?.id) throw new Error("Cleaner not found.");

  const existingAuth = String(row.auth_user_id ?? "").trim() || null;
  if (existingAuth && (await authUserIsUsable(admin, existingAuth))) {
    return finishCleanerAuthLink(admin, cleanerRowId, existingAuth);
  }

  /*
   * cleaners.auth_user_id is NOT NULL in the current schema, so stale-link
   * repair must never clear it before a replacement Auth user is ready.
   *
   * Pricing/UAT fixtures can contain DB-seeded auth.users rows that resolve by
   * email but are invisible to GoTrue Admin. Treat those as ghosts: never
   * re-link them merely because the DB email resolver found an id.
   */
  if (existingAuth) {
    log("stale auth_user_id detected; keeping link until replacement is ready", cleanerRowId, existingAuth);
  }

  const emails = resolveAuthEmailsForCleaner(row);
  if (emails.length === 0) {
    throw new Error("Could not derive an email for Auth; add an email or phone on the cleaner row.");
  }

  const unusableEmails = new Set<string>();

  for (const email of emails) {
    const uid = await findAuthUserIdByEmail(admin, email);
    if (!uid) continue;

    if (!(await authUserIsUsable(admin, uid))) {
      unusableEmails.add(email);
      log("ignoring ghost auth user resolved by email", cleanerRowId, email, uid);
      continue;
    }

    const claimant = await cleanerIdClaimingAuthUser(admin, uid);
    if (claimant && claimant !== cleanerRowId) continue;

    const { error: upErr } = await admin.from("cleaners").update({ auth_user_id: uid }).eq("id", cleanerRowId);
    if (upErr) {
      log("link-by-email update failed", cleanerRowId, email, upErr.message);
      continue;
    }
    return finishCleanerAuthLink(admin, cleanerRowId, uid);
  }

  const fullName = String(row.full_name ?? "Cleaner").trim() || "Cleaner";
  const createCandidates = authCreationEmailCandidates(row).filter((email) => !unusableEmails.has(email));
  let lastCreateError = "Could not create Supabase Auth user.";

  for (const createEmail of createCandidates) {
    const created = await admin.auth.admin.createUser({
      email: createEmail,
      password: options.passwordForNewUser,
      email_confirm: true,
      user_metadata: { role: "cleaner", source: "ensure_cleaner_auth", full_name: fullName },
    });

    if (created.error || !created.data.user?.id) {
      const msg = created.error?.message ?? "createUser failed";
      lastCreateError = msg;

      if (msg.toLowerCase().includes("already")) {
        const uid = await findAuthUserIdByEmail(admin, createEmail);
        if (uid && (await authUserIsUsable(admin, uid))) {
          const claimant = await cleanerIdClaimingAuthUser(admin, uid);
          if (!claimant || claimant === cleanerRowId) {
            const { error: upErr } = await admin.from("cleaners").update({ auth_user_id: uid }).eq("id", cleanerRowId);
            if (!upErr) return finishCleanerAuthLink(admin, cleanerRowId, uid);
          }
        }
      }

      log("auth create candidate failed", cleanerRowId, createEmail, msg);
      continue;
    }

    const newId = created.data.user.id;
    const { error: upErr } = await admin.from("cleaners").update({ auth_user_id: newId }).eq("id", cleanerRowId);
    if (upErr) {
      await admin.auth.admin.deleteUser(newId).catch(() => {});
      throw new Error(upErr.message);
    }

    return finishCleanerAuthLink(admin, cleanerRowId, newId);
  }

  throw new Error(lastCreateError);
}

/**
 * Links every cleaner missing `auth_user_id` (or with a stale id) to Auth.
 * Errors are logged and collected; successful rows are counted.
 */
export async function backfillAllCleanersMissingAuth(
  admin: SupabaseClient,
  opts?: { defaultPassword?: string },
): Promise<BackfillCleanerAuthResult> {
  const defaultPassword = opts?.defaultPassword ?? "Temp1234!ChangeMe";
  const failures: { cleanerId: string; message: string }[] = [];
  let linked = 0;

  const { data: rows, error } = await admin
    .from("cleaners")
    .select("id, email, full_name, phone, auth_user_id")
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  const list = rows ?? [];

  const needsWork: typeof list = [];
  for (const r of list) {
    const aid = (r as { auth_user_id?: string | null }).auth_user_id;
    if (!aid) {
      needsWork.push(r);
      continue;
    }
    const check = await admin.auth.admin.getUserById(String(aid));
    if (check.error || !check.data.user) needsWork.push(r);
  }

  for (const r of needsWork) {
    const id = String((r as { id: string }).id);
    try {
      await ensureCleanerLinkedToAuth(admin, id, { passwordForNewUser: defaultPassword });
      linked += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log("backfill failed", id, message);
      failures.push({ cleanerId: id, message });
    }
  }

  return {
    scanned: list.length,
    missingAuth: needsWork.length,
    linked,
    failed: failures.length,
    failures,
  };
}
