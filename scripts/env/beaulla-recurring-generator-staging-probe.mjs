#!/usr/bin/env node
/**
 * BEA-OPS-001 — Staging probe for generate-recurring-bookings cron health.
 *
 * Reads staging Supabase cron_runs (service role) and optionally checks HTTP auth
 * against the staging Preview URL. Never prints secrets. Staging only.
 *
 * Usage (repo root):
 *   node scripts/env/beaulla-recurring-generator-staging-probe.mjs
 *
 * Optional:
 *   STAGING_PROBE_INVOKE_CRON=true  — authorized POST (idempotent; may create 0 bookings)
 *
 * Evidence:
 *   docs/audits/uat/beaulla/evidence/beaulla-recurring-generator-probe-<ts>.json
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const STAGING_BASE =
  process.env.STAGING_BASE_URL?.trim() ||
  "https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app";
const STAGING_REF = "gbgnemlpyykyhpqqbgru";
const PROD_REF = "tchayecuvzssixyxlvfu";
const JOB = "generate-recurring-bookings";
const EVIDENCE_DIR = resolve(root, "docs/audits/uat/beaulla/evidence");
const STALE_MS = 30 * 60 * 1000;
const invokeCron = (process.env.STAGING_PROBE_INVOKE_CRON ?? "").toLowerCase() === "true";

function loadEnvFile(path) {
  const map = {};
  if (!existsSync(path)) return map;
  for (const line of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    map[m[1].trim()] = v;
  }
  return map;
}

function loadKeys(env) {
  return loadEnvFile(
    resolve(root, `docs/audits/environments/evidence/.secrets-local/${env}.keys.env`),
  );
}

function loadBypass() {
  const tokenPath = resolve(
    root,
    "docs/audits/environments/evidence/.secrets-local/vercel-automation-bypass.token",
  );
  if (existsSync(tokenPath)) {
    const t = readFileSync(tokenPath, "utf8").trim();
    if (t) return t;
  }
  const env = {
    ...loadEnvFile(resolve(root, "apps/web/.env.local")),
    ...loadKeys("staging"),
  };
  return env.VERCEL_AUTOMATION_BYPASS_SECRET || env.VERCEL_PROTECTION_BYPASS || "";
}

function loadCronSecret() {
  const preview = loadEnvFile(
    resolve(root, "docs/audits/environments/evidence/.secrets-local/vercel-preview-staging.env"),
  );
  const staging = loadKeys("staging");
  const local = loadEnvFile(resolve(root, "apps/web/.env.local"));
  return (
    process.env.CRON_SECRET?.trim() ||
    preview.CRON_SECRET?.trim() ||
    staging.CRON_SECRET?.trim() ||
    local.CRON_SECRET?.trim() ||
    ""
  );
}

function redact(s) {
  return String(s ?? "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]");
}

function parseMessage(message) {
  const raw = String(message ?? "").trim();
  if (!raw.startsWith("{")) return null;
  try {
    const o = JSON.parse(raw);
    if (o.skipped === true) return { lock_skipped: true, reason: o.reason ?? null };
    return {
      scanned: typeof o.scanned === "number" ? o.scanned : null,
      generated: typeof o.generated === "number" ? o.generated : null,
      skipped_duplicate: typeof o.skipped_duplicate === "number" ? o.skipped_duplicate : null,
      failed: typeof o.failed === "number" ? o.failed : null,
      skipped_plans: typeof o.skipped_plans === "number" ? o.skipped_plans : null,
    };
  } catch {
    return null;
  }
}

function classifyHealth(runs) {
  if (!runs.length) {
    return {
      healthy: false,
      severity: "red",
      reason: "no_cron_runs",
      note: "No generate-recurring-bookings rows in cron_runs. Repair staging pg_cron + cron_http_targets.",
    };
  }
  const latest = runs[0];
  const lastSuccess = runs.find((r) => r.status === "success");
  const successAgeMs = lastSuccess ? Date.now() - new Date(lastSuccess.created_at).getTime() : null;
  const parsed = parseMessage(latest.message);
  const failed = parsed?.failed ?? 0;
  const skippedPlans = parsed?.skipped_plans ?? 0;

  if (failed > 0) {
    return {
      healthy: false,
      severity: "red",
      reason: "occurrence_insert_failures",
      failed,
      last_run_at: latest.created_at,
    };
  }
  if (successAgeMs == null || successAgeMs > STALE_MS) {
    return {
      healthy: false,
      severity: "red",
      reason: "stale_or_missing_success",
      last_success_at: lastSuccess?.created_at ?? null,
      success_age_minutes: successAgeMs != null ? Math.round(successAgeMs / 60_000) : null,
      note: "Expected success every ~10 minutes via Supabase pg_cron (not Vercel Cron).",
    };
  }
  if (skippedPlans > 0) {
    return {
      healthy: true,
      severity: "amber",
      reason: "plans_skipped_data_quality",
      skipped_plans: skippedPlans,
      last_success_at: lastSuccess.created_at,
      note: "Cron is running; repair plans with missing email/profile/billing.",
    };
  }
  return {
    healthy: true,
    severity: "green",
    reason: "ok",
    last_success_at: lastSuccess.created_at,
    last_counters: parsed,
  };
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const started = new Date().toISOString();
  const evidence = {
    ticket: "BEA-OPS-001",
    started,
    stagingBaseUrl: STAGING_BASE,
    expectedStagingRef: STAGING_REF,
    productionRefForbidden: PROD_REF,
    productionTouched: false,
    scheduler: "supabase_pg_cron_not_vercel_json",
    invokeCron,
    checks: [],
    health: null,
  };

  const stagingKeys = {
    ...loadEnvFile(
      resolve(root, "docs/audits/environments/evidence/.secrets-local/vercel-preview-staging.env"),
    ),
    ...loadKeys("staging"),
  };
  const supabaseUrl =
    stagingKeys.NEXT_PUBLIC_SUPABASE_URL || stagingKeys.SUPABASE_URL || "";
  const serviceKey = stagingKeys.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !serviceKey) {
    evidence.checks.push({ name: "staging_supabase_creds", ok: false, detail: "missing" });
    writeEvidence(evidence);
    console.error("FAIL missing staging supabase credentials");
    process.exit(1);
  }

  if (supabaseUrl.includes(PROD_REF)) {
    evidence.checks.push({ name: "staging_supabase_creds", ok: false, detail: "production_ref_blocked" });
    writeEvidence(evidence);
    console.error("FAIL refused production supabase ref");
    process.exit(1);
  }

  evidence.checks.push({
    name: "staging_supabase_creds",
    ok: true,
    project_ref_suffix: STAGING_REF.slice(-6),
  });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: runs, error } = await admin
    .from("cron_runs")
    .select("job_name, status, created_at, message")
    .eq("job_name", JOB)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    evidence.checks.push({
      name: "cron_runs_query",
      ok: false,
      detail: redact(error.message),
    });
    writeEvidence(evidence);
    process.exit(1);
  }

  const sanitizedRuns = (runs ?? []).map((r) => ({
    status: r.status,
    created_at: r.created_at,
    counters: parseMessage(r.message),
    message_preview: String(r.message ?? "").slice(0, 120),
  }));

  evidence.checks.push({
    name: "cron_runs_query",
    ok: true,
    rows_24h: sanitizedRuns.length,
    recent: sanitizedRuns.slice(0, 8),
  });

  evidence.health = classifyHealth(sanitizedRuns.map((r, i) => ({
    status: r.status,
    created_at: r.created_at,
    message: (runs ?? [])[i]?.message ?? null,
  })));

  // HTTP auth probes (no invoke by default)
  const bypass = loadBypass();
  const cronSecret = loadCronSecret();
  const hdrBase = { Accept: "application/json" };
  if (bypass) hdrBase["x-vercel-protection-bypass"] = bypass;

  for (const [name, headers] of [
    ["cron_unauthenticated_rejected", { ...hdrBase }],
    ["cron_invalid_secret_rejected", { ...hdrBase, Authorization: "Bearer definitely-not-the-secret" }],
  ]) {
    try {
      const res = await fetch(`${STAGING_BASE}/api/cron/${JOB}`, {
        method: "POST",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      evidence.checks.push({
        name,
        ok: res.status === 401 || res.status === 403,
        httpStatus: res.status,
      });
    } catch (e) {
      evidence.checks.push({
        name,
        ok: false,
        detail: redact(e instanceof Error ? e.message : String(e)),
      });
    }
  }

  if (invokeCron && cronSecret) {
    try {
      const res = await fetch(`${STAGING_BASE}/api/cron/${JOB}`, {
        method: "POST",
        headers: { ...hdrBase, Authorization: `Bearer ${cronSecret}` },
        redirect: "manual",
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw_preview: redact(text).slice(0, 160) };
      }
      const sanitizedBody =
        body && typeof body === "object"
          ? {
              ok: body.ok ?? null,
              scanned: body.scanned ?? null,
              generated: body.generated ?? null,
              failed: body.failed ?? null,
              skipped_plans: body.skipped_plans ?? null,
              skipped_duplicate: body.skipped_duplicate ?? null,
              skipped: body.skipped ?? null,
              error: body.error ? redact(body.error) : null,
            }
          : null;
      evidence.checks.push({
        name: "cron_authorized_invoke",
        ok: res.status === 200,
        httpStatus: res.status,
        body: sanitizedBody,
      });
    } catch (e) {
      evidence.checks.push({
        name: "cron_authorized_invoke",
        ok: false,
        detail: redact(e instanceof Error ? e.message : String(e)),
      });
    }
  } else {
    evidence.checks.push({
      name: "cron_authorized_invoke",
      ok: true,
      skipped: true,
      reason: invokeCron ? "CRON_SECRET missing" : "STAGING_PROBE_INVOKE_CRON not set",
    });
  }

  evidence.finished = new Date().toISOString();
  const path = writeEvidence(evidence);
  const healthy = evidence.health?.healthy === true;
  console.log(
    JSON.stringify(
      {
        evidence: path,
        healthy,
        severity: evidence.health?.severity,
        reason: evidence.health?.reason,
        checks_ok: evidence.checks.filter((c) => c.ok).length,
        checks_total: evidence.checks.length,
      },
      null,
      2,
    ),
  );
  process.exit(healthy ? 0 : 2);
}

function writeEvidence(evidence) {
  const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const path = resolve(EVIDENCE_DIR, `beaulla-recurring-generator-probe-${ts}Z.json`);
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  return path;
}

main().catch((e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
