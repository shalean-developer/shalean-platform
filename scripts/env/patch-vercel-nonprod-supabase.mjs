#!/usr/bin/env node
/**
 * Patch Vercel Preview branch-scoped Supabase vars for staging only.
 *
 * The dedicated development Supabase project was retired in August 2026.
 * Development/feature branches use normal Vercel Preview deployments and must
 * never be remapped to a dedicated remote development database by this script.
 *
 * Reads keys from gitignored .secrets-local; uses Vercel dashboard cookie auth via
 * VERCEL_COOKIE env (name=value pairs) OR bearer VERCEL_TOKEN.
 * Never prints secret values.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const PROJECT = "prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc";
const TEAM = "team_gSaraaY4wPNKtO0Pfx5MY42D";

const REFS = {
  staging: "gbgnemlpyykyhpqqbgru",
};

const ENV_IDS = {
  staging: {
    NEXT_PUBLIC_SUPABASE_URL: "F7BgDvQqZIyXw6Nx",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "cpBa94mmofJoZ4J8",
    SUPABASE_SERVICE_ROLE_KEY: "jQqq2HofjPU2V4YO",
    SUPABASE_PROJECT_REF: "Ggujm1NqcRcIfoCS",
  },
};

function loadKeys(env) {
  const path = resolve(
    root,
    "docs/audits/environments/evidence/.secrets-local",
    `${env}.keys.env`,
  );
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const map = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map[m[1]] = v;
  }
  return map;
}

function authHeaders() {
  if (process.env.VERCEL_TOKEN) {
    return { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` };
  }
  if (process.env.VERCEL_COOKIE) {
    return { Cookie: process.env.VERCEL_COOKIE };
  }
  throw new Error("Set VERCEL_TOKEN or VERCEL_COOKIE");
}

async function patchEnv(id, key, value, gitBranch) {
  const url = `https://api.vercel.com/v9/projects/${PROJECT}/env/${id}?teamId=${TEAM}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      value,
      target: ["preview"],
      gitBranch,
      type: key.includes("KEY") || key.includes("SERVICE") ? "sensitive" : "plain",
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PATCH ${key} (${gitBranch}) ${res.status}: ${text.slice(0, 200)}`);
  }
  return { key, gitBranch, status: res.status, id };
}

async function main() {
  const env = "staging";
  const results = [];
  const keys = loadKeys(env);
  const ref = REFS[env];
  const url = `https://${ref}.supabase.co`;
  const anon = keys.SUPABASE_ANON_KEY;
  const service = keys.SUPABASE_SERVICE_ROLE_KEY;
  if (!anon || !service) throw new Error(`${env}: missing anon/service keys`);

  const values = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
    SUPABASE_PROJECT_REF: ref,
  };

  for (const [key, id] of Object.entries(ENV_IDS[env])) {
    results.push(await patchEnv(id, key, values[key], env));
    console.log(`patched ${env} ${key} -> ref=${ref} status=ok`);
  }

  const evidence = resolve(
    root,
    "docs/audits/environments/evidence/env-03-vercel-supabase-remap.json",
  );
  writeFileSync(
    evidence,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        results: results.map((r) => ({
          key: r.key,
          gitBranch: r.gitBranch,
          id: r.id,
          status: r.status,
        })),
        refs: REFS,
        developmentProjectRetired: true,
        productionUntouched: true,
      },
      null,
      2,
    ),
  );
  console.log("evidence written (ids only)");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
