#!/usr/bin/env node
/**
 * PAYOUT-OPS-001 / KI-OPS-003 remediation verification (Preview → staging).
 * Sequential + concurrent reject audit exactly-once. Restores fixture in finally.
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const STAGING_REF = "gbgnemlpyykyhpqqbgru";
const PROD_REF = "tchayecuvzssixyxlvfu";
const BOOKING = "04ee8cad-9a3d-4154-b746-1591603f95d0";
const MEMBER = "a1111111-1111-4111-8111-111111111108";
const TEAM_ID = "b1111111-1111-4111-8111-111111111204";
const LEAD = "a1111111-1111-4111-8111-111111111107";
const MAKER_EMAIL = "staging-admin@shalean.test";
const CHECKER_EMAIL = "info@shalean.com";

const PREVIEW =
  process.env.PREVIEW_BASE_URL?.trim() ||
  "";

const secretsDir = resolve(root, "docs/audits/environments/evidence/.secrets-local");
const evidenceDir = resolve(root, "docs/audits/cleaner-payouts/PAYOUT-OPS-001/evidence");
const evidencePath = resolve(evidenceDir, "ki-ops-003-remediation-raw-2026-07-21.json");

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
    map[m[1]] = v;
  }
  return map;
}

function bypassUrl(path) {
  if (!PREVIEW) throw new Error("PREVIEW_BASE_URL required");
  const bypass = readFileSync(resolve(secretsDir, "vercel-automation-bypass.token"), "utf8").trim();
  const u = new URL(path, PREVIEW);
  u.searchParams.set("x-vercel-protection-bypass", bypass);
  return u.toString();
}

async function signIn(pub, email, password) {
  const { data, error } = await pub.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error || new Error(`sign-in failed for ${email}`);
  return { token: data.session.access_token, userId: data.user.id, email: data.user.email };
}

async function api(token, method, path, body) {
  const bypass = readFileSync(resolve(secretsDir, "vercel-automation-bypass.token"), "utf8").trim();
  const res = await fetch(bypassUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-vercel-protection-bypass": bypass,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function memberCents(admin, bookingId, cleanerId) {
  const { data } = await admin
    .from("team_job_member_payouts")
    .select("payout_cents")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  return data?.payout_cents ?? null;
}

async function countRejectAudits(admin, proposalId) {
  const { data, error } = await admin
    .from("payout_audit_events")
    .select("id, event_type, actor_user_id, created_at, context, reference, old_values, new_values")
    .eq("event_type", "visit_earnings_adjustment_rejected")
    .filter("context->>proposal_id", "eq", proposalId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadProposal(admin, id) {
  const { data } = await admin.from("admin_money_action_proposals").select("*").eq("id", id).maybeSingle();
  return data;
}

async function seedFixture(admin) {
  await admin
    .from("admin_money_action_proposals")
    .update({
      status: "expired",
      review_note: "KI-OPS-003 remediation: clear open before fixture",
    })
    .eq("booking_id", BOOKING)
    .in("status", ["pending", "processing"]);

  await admin
    .from("bookings")
    .update({
      is_team_job: true,
      team_id: TEAM_ID,
      service_date: "2026-07-20",
      cleaner_id: LEAD,
    })
    .eq("id", BOOKING);

  await admin.from("team_job_member_payouts").upsert(
    {
      booking_id: BOOKING,
      cleaner_id: MEMBER,
      payout_cents: 15000,
      bonus_cents: 0,
    },
    { onConflict: "booking_id,cleaner_id" },
  );
}

async function main() {
  mkdirSync(evidenceDir, { recursive: true });
  const keys = loadEnvFile(resolve(secretsDir, "staging.keys.env"));
  const pw = loadEnvFile(resolve(secretsDir, "staging.synthetic-passwords.env"));
  const url = (
    keys.NEXT_PUBLIC_SUPABASE_URL ||
    keys.SUPABASE_URL ||
    `https://${STAGING_REF}.supabase.co`
  ).trim();
  const anon = (
    keys.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    keys.SUPABASE_ANON_KEY ||
    keys.SUPABASE_PUBLISHABLE_KEY ||
    ""
  ).trim();
  const service = (keys.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url.includes(STAGING_REF) || url.includes(PROD_REF)) throw new Error("refuse non-staging");
  if (!anon || !service) throw new Error("missing keys");
  if (!pw[MAKER_EMAIL] || !pw[CHECKER_EMAIL]) throw new Error("missing maker/checker passwords");
  if (!PREVIEW) throw new Error("Set PREVIEW_BASE_URL to Preview deployment");

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const pub = createClient(url, anon, { auth: { persistSession: false } });

  let commitSha = process.env.GIT_SHA?.trim() || "";
  try {
    commitSha = commitSha || execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    /* ignore */
  }

  const evidence = {
    package: "PAYOUT-OPS-001",
    issue: "KI-OPS-003",
    mode: "remediation-verify",
    startedAt: new Date().toISOString(),
    commitSha,
    previewBaseUrl: PREVIEW.replace(/https?:\/\//, "").split(".")[0],
    stagingRef: STAGING_REF,
    sequential: null,
    concurrent: null,
    multiConcurrent: null,
    health: null,
  };

  const maker = await signIn(pub, MAKER_EMAIL, pw[MAKER_EMAIL]);
  const checker = await signIn(pub, CHECKER_EMAIL, pw[CHECKER_EMAIL]);
  if (maker.userId === checker.userId) throw new Error("maker/checker must differ");

  const health = await api(checker.token, "GET", "/api/health/environment");
  evidence.health = {
    shaleanAppEnv: health.json.shaleanAppEnv,
    configuredRef: health.json.supabase?.configuredRef,
    gitSha: health.json.marketingOAuth?.gitSha ?? health.json.gitSha ?? null,
    gitBranch: health.json.gitBranch ?? health.json.marketingOAuth?.gitBranch ?? null,
    vercelEnv: health.json.vercelEnv ?? null,
  };
  if (health.json.supabase?.configuredRef !== STAGING_REF) {
    throw new Error(`Preview not bound to staging: ${health.json.supabase?.configuredRef}`);
  }

  await seedFixture(admin);
  const baseline = await memberCents(admin, BOOKING, MEMBER);
  if (baseline !== 15000) throw new Error(`baseline ${baseline}`);

  try {
    // --- Sequential ---
    const propose1 = await api(maker.token, "PATCH", `/api/admin/bookings/${BOOKING}/adjust-payout-earnings`, {
      payout_cents: 16000,
      bonus_cents: 0,
      cleaner_id: MEMBER,
      adjustment_note: "KI-OPS-003 remediation sequential reject",
    });
    if (!propose1.ok || !propose1.json.proposal_id) {
      throw new Error(`propose1 failed: ${JSON.stringify(propose1.json)}`);
    }
    const seqId = propose1.json.proposal_id;
    const beforeEarnings = await memberCents(admin, BOOKING, MEMBER);

    const reject1 = await api(checker.token, "POST", `/api/admin/money-action-proposals/${seqId}/reject`, {
      review_note: "KI-OPS-003 rem sequential note A",
    });
    const afterReject1 = await loadProposal(admin, seqId);
    const auditsAfter1 = await countRejectAudits(admin, seqId);

    const reject2 = await api(checker.token, "POST", `/api/admin/money-action-proposals/${seqId}/reject`, {
      review_note: "KI-OPS-003 rem sequential note B MUST NOT APPLY",
    });
    const afterReject2 = await loadProposal(admin, seqId);
    const auditsAfter2 = await countRejectAudits(admin, seqId);
    const afterEarnings = await memberCents(admin, BOOKING, MEMBER);

    const approveAfter = await api(
      checker.token,
      "POST",
      `/api/admin/money-action-proposals/${seqId}/approve`,
      { confirm: true },
    );

    const seqPass =
      auditsAfter2.length === 1 &&
      afterReject2?.status === "rejected" &&
      afterReject2?.reviewed_by === afterReject1?.reviewed_by &&
      afterReject2?.review_note === afterReject1?.review_note &&
      afterReject2?.reviewed_at === afterReject1?.reviewed_at &&
      beforeEarnings === afterEarnings &&
      afterEarnings === 15000 &&
      reject2.json.already_processed === true &&
      !approveAfter.ok;

    evidence.sequential = {
      proposalId: seqId,
      reject1: {
        status: reject1.status,
        already_processed: reject1.json.already_processed,
      },
      reject2: {
        status: reject2.status,
        already_processed: reject2.json.already_processed,
      },
      proposalAfterFirst: {
        status: afterReject1?.status,
        reviewed_by: afterReject1?.reviewed_by,
        review_note: afterReject1?.review_note,
        reviewed_at: afterReject1?.reviewed_at,
      },
      proposalAfterRetry: {
        status: afterReject2?.status,
        reviewed_by: afterReject2?.reviewed_by,
        review_note: afterReject2?.review_note,
        reviewed_at: afterReject2?.reviewed_at,
      },
      checkerUnchanged: afterReject2?.reviewed_by === afterReject1?.reviewed_by,
      reviewNoteUnchanged: afterReject2?.review_note === afterReject1?.review_note,
      reviewedAtUnchanged: afterReject2?.reviewed_at === afterReject1?.reviewed_at,
      earningsUnchanged: beforeEarnings === afterEarnings && afterEarnings === 15000,
      rejectAuditCountAfterFirst: auditsAfter1.length,
      rejectAuditCountAfterRetry: auditsAfter2.length,
      rejectAuditIds: auditsAfter2.map((a) => a.id),
      rejectAuditReferences: auditsAfter2.map((a) => a.reference),
      approveAfterReject: { status: approveAfter.status, code: approveAfter.json.code },
      approveAfterRejectBlocked: !approveAfter.ok,
      verdict: seqPass ? "PASS" : "FAIL",
    };

    // --- Concurrent (2) ---
    await seedFixture(admin);
    const propose2 = await api(maker.token, "PATCH", `/api/admin/bookings/${BOOKING}/adjust-payout-earnings`, {
      payout_cents: 15500,
      bonus_cents: 0,
      cleaner_id: MEMBER,
      adjustment_note: "KI-OPS-003 remediation concurrent reject",
    });
    if (!propose2.ok || !propose2.json.proposal_id) {
      throw new Error(`propose2 failed: ${JSON.stringify(propose2.json)}`);
    }
    const concId = propose2.json.proposal_id;
    const earnBeforeConc = await memberCents(admin, BOOKING, MEMBER);

    const [c1, c2] = await Promise.all([
      api(checker.token, "POST", `/api/admin/money-action-proposals/${concId}/reject`, {
        review_note: "KI-OPS-003 rem concurrent A",
      }),
      api(checker.token, "POST", `/api/admin/money-action-proposals/${concId}/reject`, {
        review_note: "KI-OPS-003 rem concurrent B",
      }),
    ]);
    const concRow = await loadProposal(admin, concId);
    const concAudits = await countRejectAudits(admin, concId);
    const earnAfterConc = await memberCents(admin, BOOKING, MEMBER);

    const winners = [c1, c2].filter((r) => r.ok && r.json.already_processed !== true);
    const losers = [c1, c2].filter((r) => r.ok && r.json.already_processed === true);
    const concPass =
      concAudits.length === 1 &&
      concRow?.status === "rejected" &&
      earnBeforeConc === earnAfterConc &&
      earnAfterConc === 15000 &&
      winners.length === 1 &&
      losers.length === 1;

    evidence.concurrent = {
      proposalId: concId,
      responses: [
        { status: c1.status, ok: c1.ok, already_processed: c1.json.already_processed },
        { status: c2.status, ok: c2.ok, already_processed: c2.json.already_processed },
      ],
      winners: winners.length,
      losers: losers.length,
      proposal: {
        status: concRow?.status,
        reviewed_by: concRow?.reviewed_by,
        review_note: concRow?.review_note,
        reviewed_at: concRow?.reviewed_at,
      },
      earningsUnchanged: earnBeforeConc === earnAfterConc && earnAfterConc === 15000,
      rejectAuditCount: concAudits.length,
      rejectAuditIds: concAudits.map((a) => a.id),
      rejectAuditReferences: concAudits.map((a) => a.reference),
      verdict: concPass ? "PASS" : "FAIL",
    };

    // --- Multi concurrent (4) ---
    await seedFixture(admin);
    const propose3 = await api(maker.token, "PATCH", `/api/admin/bookings/${BOOKING}/adjust-payout-earnings`, {
      payout_cents: 15200,
      bonus_cents: 0,
      cleaner_id: MEMBER,
      adjustment_note: "KI-OPS-003 remediation multi concurrent reject",
    });
    if (!propose3.ok || !propose3.json.proposal_id) {
      throw new Error(`propose3 failed: ${JSON.stringify(propose3.json)}`);
    }
    const multiId = propose3.json.proposal_id;
    const multiRes = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        api(checker.token, "POST", `/api/admin/money-action-proposals/${multiId}/reject`, {
          review_note: `KI-OPS-003 rem multi ${i}`,
        }),
      ),
    );
    const multiRow = await loadProposal(admin, multiId);
    const multiAudits = await countRejectAudits(admin, multiId);
    const multiEarn = await memberCents(admin, BOOKING, MEMBER);
    const multiWinners = multiRes.filter((r) => r.ok && r.json.already_processed !== true);
    const multiLosers = multiRes.filter((r) => r.ok && r.json.already_processed === true);
    const multiPass =
      multiAudits.length === 1 &&
      multiRow?.status === "rejected" &&
      multiEarn === 15000 &&
      multiWinners.length === 1 &&
      multiLosers.length === 3;

    evidence.multiConcurrent = {
      proposalId: multiId,
      responseCount: multiRes.length,
      winners: multiWinners.length,
      losers: multiLosers.length,
      proposalStatus: multiRow?.status,
      earningsUnchanged: multiEarn === 15000,
      rejectAuditCount: multiAudits.length,
      rejectAuditIds: multiAudits.map((a) => a.id),
      verdict: multiPass ? "PASS" : "FAIL",
    };
  } finally {
    await seedFixture(admin);
    await admin
      .from("admin_money_action_proposals")
      .update({
        status: "expired",
        review_note: "KI-OPS-003 remediation cleanup",
      })
      .eq("booking_id", BOOKING)
      .in("status", ["pending", "processing"]);
    evidence.restoredAt = new Date().toISOString();
  }

  evidence.finishedAt = new Date().toISOString();
  evidence.overallVerdict =
    evidence.sequential?.verdict === "PASS" &&
    evidence.concurrent?.verdict === "PASS" &&
    evidence.multiConcurrent?.verdict === "PASS"
      ? "PASS"
      : "FAIL";

  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify(
      {
        evidencePath,
        overall: evidence.overallVerdict,
        sequential: evidence.sequential?.verdict,
        sequentialAudits: evidence.sequential?.rejectAuditCountAfterRetry,
        concurrent: evidence.concurrent?.verdict,
        concurrentAudits: evidence.concurrent?.rejectAuditCount,
        multi: evidence.multiConcurrent?.verdict,
        multiAudits: evidence.multiConcurrent?.rejectAuditCount,
        commitSha,
        previewGitSha: evidence.health?.gitSha,
      },
      null,
      2,
    ),
  );
  if (evidence.overallVerdict !== "PASS") process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
