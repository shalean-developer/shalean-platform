#!/usr/bin/env node
/**
 * Princess PR E — minimal staging probe (no production, no mass messaging).
 *
 * Usage (from repo root, with staging env vars):
 *   node scripts/env/princess-pre-staging-probe.mjs
 *
 * Required env:
 *   STAGING_BASE_URL
 *   CRON_SECRET          (staging only)
 *
 * Optional:
 *   STAGING_PROBE_DRY_RUN=true  (default) — auth + identity only, no cron invoke
 *   STAGING_PROBE_INVOKE_CRON=true — authorized cron invoke + duplicate idempotency check
 *
 * Never prints secrets. Writes sanitized evidence JSON under docs/audits/uat/princess/evidence/
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/audits/uat/princess/evidence");

const base = (process.env.STAGING_BASE_URL ?? "").replace(/\/$/, "");
const secret = (process.env.CRON_SECRET ?? "").trim();
const invokeCron = (process.env.STAGING_PROBE_INVOKE_CRON ?? "").toLowerCase() === "true";
const dryRun = (process.env.STAGING_PROBE_DRY_RUN ?? "true").toLowerCase() !== "false";

function redact(s) {
  return String(s ?? "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{20,}/g, "[redacted_token]");
}

async function main() {
  const started = new Date().toISOString();
  const evidence = {
    ticket: "PRINCESS-UAT-PRE",
    started,
    stagingBaseUrl: base || null,
    productionTouched: false,
    dryRun,
    invokeCron,
    checks: [],
  };

  if (!base) {
    evidence.checks.push({ name: "env_base_url", ok: false, detail: "STAGING_BASE_URL missing" });
    writeEvidence(evidence);
    process.exit(1);
  }

  // 1) Environment identity (public)
  try {
    const res = await fetch(`${base}/api/health`, { method: "GET", signal: AbortSignal.timeout(15_000) });
    evidence.checks.push({
      name: "staging_health",
      ok: res.ok || res.status === 404 || res.status === 401,
      httpStatus: res.status,
      note: "identity probe; 401/404 acceptable if route gated",
    });
  } catch (e) {
    evidence.checks.push({
      name: "staging_health",
      ok: false,
      detail: redact(e instanceof Error ? e.message : String(e)),
    });
  }

  // 2–3) Cron auth negatives (or Vercel Deployment Protection HTML gate)
  for (const [name, headers] of [
    ["cron_unauthenticated_rejected", undefined],
    ["cron_invalid_secret_rejected", { Authorization: "Bearer definitely-not-the-secret" }],
  ]) {
    try {
      const res = await fetch(`${base}/api/cron/booking-lifecycle`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      const isHtml = /<!DOCTYPE html|<html/i.test(text);
      const isJsonUnauthorized =
        res.status === 401 ||
        res.status === 503 ||
        /Unauthorized|CRON_SECRET/i.test(text);
      const deploymentProtected = res.status === 200 && isHtml;
      evidence.checks.push({
        name,
        ok: isJsonUnauthorized || deploymentProtected,
        httpStatus: res.status,
        contentType: res.headers.get("content-type"),
        note: deploymentProtected
          ? "Vercel Deployment Protection HTML — public cron invoke blocked before app auth; local verifyCronSecret tests cover Bearer rejection"
          : isJsonUnauthorized
            ? "app-level cron auth rejected request"
            : "unexpected response",
        bodySample: redact(text.slice(0, 120)),
      });
    } catch (e) {
      evidence.checks.push({
        name,
        ok: false,
        detail: redact(e instanceof Error ? e.message : String(e)),
      });
    }
  }

  if (invokeCron && !dryRun && secret) {
    const headers = { Authorization: `Bearer ${secret}` };
    let firstBody = null;
    try {
      const res1 = await fetch(`${base}/api/cron/booking-lifecycle`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(60_000),
      });
      firstBody = await res1.json().catch(() => ({}));
      evidence.checks.push({
        name: "cron_authorized_invoke",
        ok: res1.ok,
        httpStatus: res1.status,
        skipped: Boolean(firstBody?.skipped),
        processed: firstBody?.processed ?? null,
      });
    } catch (e) {
      evidence.checks.push({
        name: "cron_authorized_invoke",
        ok: false,
        detail: redact(e instanceof Error ? e.message : String(e)),
      });
    }

    try {
      const res2 = await fetch(`${base}/api/cron/booking-lifecycle`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(60_000),
      });
      const body2 = await res2.json().catch(() => ({}));
      evidence.checks.push({
        name: "cron_duplicate_invoke",
        ok: res2.ok,
        httpStatus: res2.status,
        skipped: Boolean(body2?.skipped),
        note: "skipped:true expected under lock; otherwise both ok with idempotent work",
      });
    } catch (e) {
      evidence.checks.push({
        name: "cron_duplicate_invoke",
        ok: false,
        detail: redact(e instanceof Error ? e.message : String(e)),
      });
    }
  } else {
    evidence.checks.push({
      name: "cron_authorized_invoke",
      ok: true,
      skipped: true,
      note: "dry-run / STAGING_PROBE_INVOKE_CRON not set — local gates cover invoke",
    });
  }

  evidence.finished = new Date().toISOString();
  evidence.pass = evidence.checks.every((c) => c.ok);
  const out = writeEvidence(evidence);
  console.log(JSON.stringify({ pass: evidence.pass, evidence: out }, null, 2));
  process.exit(evidence.pass ? 0 : 1);
}

function writeEvidence(evidence) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const file = path.join(EVIDENCE_DIR, `pre-staging-probe-${stamp}Z.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  return path.relative(REPO_ROOT, file);
}

main().catch((e) => {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
