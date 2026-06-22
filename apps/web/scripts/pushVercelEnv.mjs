/**
 * Push env vars from .env.local to Vercel production (non-interactive).
 * Usage: node scripts/pushVercelEnv.mjs web RESEND_API_KEY RESEND_FROM CRON_SECRET
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const project = process.argv[2];
const keys = process.argv.slice(3);
if (!project || keys.length === 0) {
  console.error("Usage: node scripts/pushVercelEnv.mjs <project> <KEY> [...]");
  process.exit(1);
}

const envPath = resolve(process.cwd(), ".env.local");
const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
const map = new Map();
for (const line of lines) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let val = m[2].trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  map.set(m[1], val);
}

spawnSync("npx", ["vercel", "link", "--project", project, "--yes"], { stdio: "inherit", shell: true });

for (const key of keys) {
  const value = map.get(key);
  if (!value) {
    console.error(`skip ${key}: not in .env.local`);
    continue;
  }
  console.log(`push ${project}/${key} (${value.length} chars, prefix ${value.slice(0, 8)}…)`);
  const res = spawnSync("npx", ["vercel", "env", "add", key, "production", "--force"], {
    input: value,
    encoding: "utf8",
    shell: true,
  });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status ?? 1);
  }
}

console.log("done");
