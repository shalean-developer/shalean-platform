/**
 * Backfill user_profiles.role where role IS NULL.
 * Uses inferUserProfileRole (admin email allowlist, cleaners.auth_user_id, else customer).
 *
 * From `apps/web`:
 *   npm run backfill:customer-profile-roles           # dry-run
 *   npm run backfill:customer-profile-roles -- --apply
 */

import { createClient } from "@supabase/supabase-js";

import { inferUserProfileRole } from "../lib/admin/inferUserProfileRole";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("id, full_name, role")
    .is("role", null);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = profiles ?? [];
  const planned: { id: string; full_name: string | null; role: string }[] = [];

  for (const row of rows) {
    const id = String((row as { id: string }).id);
    const { data: authData } = await admin.auth.admin.getUserById(id);
    const role = await inferUserProfileRole(admin, id, authData?.user?.email ?? null);
    planned.push({
      id,
      full_name: (row as { full_name?: string | null }).full_name ?? null,
      role,
    });
  }

  const byRole = planned.reduce<Record<string, number>>((acc, p) => {
    acc[p.role] = (acc[p.role] ?? 0) + 1;
    return acc;
  }, {});

  console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN");
  console.log(`Null role profiles: ${rows.length}`);
  console.log("Planned roles:", byRole);

  for (const row of planned.slice(0, 20)) {
    console.log(`  ${row.id.slice(0, 8)} role=${row.role} ${row.full_name ?? "(no name)"}`);
  }
  if (planned.length > 20) console.log(`  … and ${planned.length - 20} more`);

  if (!apply || planned.length === 0) return;

  let updated = 0;
  for (const row of planned) {
    const { error: upErr } = await admin
      .from("user_profiles")
      .update({ role: row.role, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("role", null);
    if (upErr) {
      console.error(upErr.message);
      process.exit(1);
    }
    updated += 1;
  }

  console.log(`Updated ${updated} profile(s).`);
}

void main();
