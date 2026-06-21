/**
 * Sync cleaners roster fields → linked user_profiles (role, name, phone).
 *
 * From `apps/web`:
 *   npm run backfill:cleaner-user-profiles           # dry-run
 *   npm run backfill:cleaner-user-profiles -- --apply
 */

import { createClient } from "@supabase/supabase-js";

import { backfillAllCleanerUserProfiles } from "../lib/cleaner/syncCleanerUserProfile";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: linked } = await admin
    .from("cleaners")
    .select("id, full_name, auth_user_id")
    .not("auth_user_id", "is", null)
    .order("full_name");

  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, full_name, role")
    .eq("role", "cleaner");

  const nameless = (profiles ?? []).filter(
    (p) => !String((p as { full_name?: string | null }).full_name ?? "").trim(),
  );

  console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN");
  console.log(`Cleaners with auth_user_id: ${linked?.length ?? 0}`);
  console.log(`user_profiles role=cleaner: ${profiles?.length ?? 0}`);
  console.log(`Nameless cleaner profiles: ${nameless.length}`);

  for (const row of (linked ?? []).slice(0, 10)) {
    const r = row as { id: string; full_name?: string | null; auth_user_id: string };
    console.log(`  ${r.full_name ?? "(no name)"} → ${r.auth_user_id.slice(0, 8)}`);
  }
  if ((linked?.length ?? 0) > 10) console.log(`  … and ${(linked?.length ?? 0) - 10} more`);

  if (!apply) return;

  const result = await backfillAllCleanerUserProfiles(admin);
  console.log(`Synced ${result.synced}/${result.scanned} (${result.created} created).`);
  if (result.failed > 0) {
    console.log(`Failed ${result.failed}:`);
    for (const f of result.failures.slice(0, 5)) {
      console.log(`  ${f.cleanerId.slice(0, 8)}: ${f.error}`);
    }
  }

  const { data: after } = await admin
    .from("user_profiles")
    .select("id, full_name, role")
    .eq("role", "cleaner");
  const namelessAfter = (after ?? []).filter(
    (p) => !String((p as { full_name?: string | null }).full_name ?? "").trim(),
  );
  console.log(`After: ${after?.length ?? 0} cleaner profiles, ${namelessAfter.length} still nameless.`);
}

void main();
