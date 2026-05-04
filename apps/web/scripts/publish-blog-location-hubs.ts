/**
 * Verifies 7 draft hub rows then publishes them. Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL.
 * Run from repo root: npx tsx apps/web/scripts/publish-blog-location-hubs.ts
 * Or from apps/web with env loaded.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const paths = [
    resolve(process.cwd(), "apps/web/.env.local"),
    resolve(process.cwd(), ".env.local"),
  ];
  for (const p of paths) {
    try {
      const raw = readFileSync(p, "utf8");
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i === -1) continue;
        const key = t.slice(0, i).trim();
        let val = t.slice(i + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
      return;
    } catch {
      continue;
    }
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: rows, error: selErr } = await supabase
    .from("blog_posts")
    .select("slug,status")
    .like("slug", "cleaning-services-%");

  if (selErr) {
    console.error("SELECT failed:", selErr.message);
    process.exit(1);
  }

  const list = rows ?? [];
  console.log(JSON.stringify({ step: "verify", count: list.length, rows: list }, null, 2));

  if (list.length !== 7) {
    console.error(`STOP: expected 7 hub rows, got ${list.length}`);
    process.exit(1);
  }

  const bad = list.filter((r) => r.status !== "draft");
  if (bad.length > 0) {
    console.error("STOP: expected all status=draft, got:", bad);
    process.exit(1);
  }

  const { data: updated, error: updErr } = await supabase
    .from("blog_posts")
    .update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .like("slug", "cleaning-services-%")
    .eq("status", "draft")
    .select("slug,status,published_at");

  if (updErr) {
    console.error("UPDATE failed:", updErr.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ step: "published", count: updated?.length ?? 0, rows: updated }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
