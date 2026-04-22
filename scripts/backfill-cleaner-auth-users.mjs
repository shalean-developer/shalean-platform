#!/usr/bin/env node
/**
 * Backfill public.cleaners.auth_user_id and ensure each cleaner has a Supabase Auth user.
 *
 * Usage (from repo root):
 *   node scripts/backfill-cleaner-auth-users.mjs
 *
 * Requires apps/web/.env.local (or env) with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional: TEMP_CLEANER_PASSWORD (default Temp1234!ChangeMe) — only used for newly created auth users.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const requireFromWeb = createRequire(path.join(repoRoot, "apps", "web", "package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

function parseDotEnv(content) {
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function loadEnv() {
  const envPath = path.join(repoRoot, "apps", "web", ".env.local");
  try {
    const raw = await fs.readFile(envPath, "utf8");
    return parseDotEnv(raw);
  } catch {
    return {};
  }
}

async function main() {
  const fileEnv = await loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (env or apps/web/.env.local).");
  }

  const tempPassword =
    process.env.TEMP_CLEANER_PASSWORD ?? fileEnv.TEMP_CLEANER_PASSWORD ?? "Temp1234!ChangeMe";

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: cleaners, error: listErr } = await admin
    .from("cleaners")
    .select("id, email, full_name, phone, auth_user_id")
    .order("created_at", { ascending: true });

  if (listErr) throw new Error(`Failed to list cleaners: ${listErr.message}`);

  const rows = cleaners ?? [];
  let createdAuth = 0;
  let skipped = 0;
  const errors = [];

  function generatedLoginEmailFromPhone(phone) {
    let d = String(phone ?? "").replace(/\D/g, "");
    if (!d) return null;
    if (d.startsWith("0")) d = `27${d.slice(1)}`;
    else if (!d.startsWith("27")) d = `27${d}`;
    return `${d}@cleaner.shalean.com`.toLowerCase();
  }

  for (const row of rows) {
    if (row.auth_user_id) continue;

    const cleanerId = String(row.id);

    const digits = String(row.phone ?? "").replace(/\D/g, "");
    const gen = generatedLoginEmailFromPhone(row.phone);
    const email =
      String(row.email ?? "")
        .trim()
        .toLowerCase() ||
      gen ||
      `cleaner-migrate-${digits || cleanerId.replace(/-/g, "").slice(0, 12)}@shalean.local`;

    const fullName = String(row.full_name ?? "Cleaner").trim() || "Cleaner";

    const created = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: "cleaner", source: "backfill_cleaner_auth_users", full_name: fullName },
    });

    if (created.error || !created.data.user?.id) {
      const msg = created.error?.message ?? "createUser failed";
      if (msg.toLowerCase().includes("already been registered") || msg.toLowerCase().includes("already registered")) {
        let foundId = null;
        for (let page = 1; page < 25; page += 1) {
          const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (listed.error) {
            errors.push({ cleanerId, step: "listUsers_after_duplicate", message: listed.error.message });
            foundId = null;
            break;
          }
          const found = listed.data.users.find((u) => (u.email ?? "").toLowerCase() === email);
          if (found?.id) {
            foundId = found.id;
            break;
          }
          if (listed.data.users.length < 1000) break;
        }
        if (!foundId) {
          errors.push({ cleanerId, step: "resolve_duplicate_email", message: "Could not resolve existing auth user." });
          skipped += 1;
          continue;
        }
        const { error: upErr } = await admin.from("cleaners").update({ auth_user_id: foundId }).eq("id", cleanerId);
        if (upErr) {
          errors.push({ cleanerId, step: "update_auth_user_id_after_duplicate", message: upErr.message });
          skipped += 1;
          continue;
        }
        createdAuth += 1;
        continue;
      }
      errors.push({ cleanerId, step: "createUser", message: msg });
      skipped += 1;
      continue;
    }

    const authUserId = created.data.user.id;
    const { error: upErr } = await admin.from("cleaners").update({ auth_user_id: authUserId }).eq("id", cleanerId);
    if (upErr) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      errors.push({ cleanerId, step: "update_auth_user_id", message: upErr.message });
      skipped += 1;
      continue;
    }

    createdAuth += 1;
  }

  console.log(
    JSON.stringify(
      {
        totalCleaners: rows.length,
        createdOrLinkedAuth: createdAuth,
        skipped,
        errors,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
