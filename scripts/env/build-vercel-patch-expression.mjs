#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function load(env) {
  const map = {};
  const raw = readFileSync(
    resolve(root, `docs/audits/environments/evidence/.secrets-local/${env}.keys.env`),
    "utf8",
  ).replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
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

const stg = load("staging");
const dev = load("development");

const expression = `((async () => {
  const projectId = 'prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc';
  const teamId = 'team_gSaraaY4wPNKtO0Pfx5MY42D';
  const patches = [
    { id: 'F7BgDvQqZIyXw6Nx', key: 'NEXT_PUBLIC_SUPABASE_URL', gitBranch: 'staging', value: ${JSON.stringify(`https://gbgnemlpyykyhpqqbgru.supabase.co`)}, type: 'sensitive' },
    { id: 'cpBa94mmofJoZ4J8', key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', gitBranch: 'staging', value: ${JSON.stringify(stg.SUPABASE_ANON_KEY)}, type: 'sensitive' },
    { id: 'jQqq2HofjPU2V4YO', key: 'SUPABASE_SERVICE_ROLE_KEY', gitBranch: 'staging', value: ${JSON.stringify(stg.SUPABASE_SERVICE_ROLE_KEY)}, type: 'sensitive' },
    { id: 'Ggujm1NqcRcIfoCS', key: 'SUPABASE_PROJECT_REF', gitBranch: 'staging', value: 'gbgnemlpyykyhpqqbgru', type: 'sensitive' },
    { id: 'FhYRRUUabuV9bCaf', key: 'NEXT_PUBLIC_SUPABASE_URL', gitBranch: 'development', value: ${JSON.stringify(`https://mbvixuzfvzbooiurvxwz.supabase.co`)}, type: 'sensitive' },
    { id: '08WNwBjUWJJaBiUW', key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', gitBranch: 'development', value: ${JSON.stringify(dev.SUPABASE_ANON_KEY)}, type: 'plain' },
    { id: 'JSup8Pcw6HEQZV8s', key: 'SUPABASE_SERVICE_ROLE_KEY', gitBranch: 'development', value: ${JSON.stringify(dev.SUPABASE_SERVICE_ROLE_KEY)}, type: 'sensitive' },
    { id: 'V3QHC1VXxf2HqAlz', key: 'SUPABASE_PROJECT_REF', gitBranch: 'development', value: 'mbvixuzfvzbooiurvxwz', type: 'plain' },
  ];
  const out = [];
  for (const p of patches) {
    const res = await fetch(\`/api/v9/projects/\${projectId}/env/\${p.id}?teamId=\${teamId}\`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        value: p.value,
        target: ['preview'],
        gitBranch: p.gitBranch,
        type: p.type,
      }),
    });
    out.push({ key: p.key, gitBranch: p.gitBranch, status: res.status, ok: res.ok });
  }
  return { ok: out.every(x => x.ok), out };
})())`;

const outPath = resolve(
  root,
  "docs/audits/environments/evidence/.secrets-local/vercel-patch.expression.js",
);
if (!stg.SUPABASE_ANON_KEY || !stg.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("staging keys incomplete after parse");
}
if (!dev.SUPABASE_ANON_KEY || !dev.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("development keys incomplete after parse");
}
writeFileSync(outPath, expression);
console.log("expression_path=" + outPath);
console.log("stg_anon_len=" + stg.SUPABASE_ANON_KEY.length);
console.log("dev_anon_len=" + dev.SUPABASE_ANON_KEY.length);
