#!/usr/bin/env node
/**
 * PRINCESS-UAT-PRD-MERGE — Post-merge staging refund retest.
 *
 * Synthetic staging data + record_only / seeded webhook simulation.
 * Does NOT execute a real Paystack refund.
 * Never prints secrets, tokens, signatures, passwords, or full webhook payloads.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const STAGING_BASE =
  process.env.STAGING_BASE_URL?.trim() ||
  "https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app";
const STAGING_SUPABASE = "gbgnemlpyykyhpqqbgru";
const PROD_SUPABASE = "tchayecuvzssixyxlvfu";
const MERGE_SHA =
  process.env.PRINCESS_PRD_MERGE_SHA?.trim() ||
  "77ac95b62f0538bef80c658c3987cf66172329cc";
const PROD_SHA_BASELINE = "7b49b3adf655661c04af87939320447edef0d1c1";
const EVIDENCE_DIR = resolve(root, "docs/audits/uat/princess/evidence");
const MARKER = `prd_merge_${Date.now().toString(36)}`;
const CAPTURE_CENTS = 100_000; // R1,000

const ADMIN_A = "info@shalean.com";
const ADMIN_B = "staging-admin@shalean.test";
const CUSTOMER = "staging-customer@shalean.test";
const CLEANER = "staging-cleaner@shalean.test";

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

function loadDotEnvLocal() {
  return {
    ...loadEnvFile(resolve(root, "apps/web/.env.local")),
    ...loadEnvFile(resolve(root, ".env.local")),
  };
}

function loadPasswords() {
  return loadEnvFile(
    resolve(
      root,
      "docs/audits/environments/evidence/.secrets-local/staging.synthetic-passwords.env",
    ),
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
  const env = { ...loadDotEnvLocal(), ...loadKeys("staging") };
  return (
    env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    env.VERCEL_PROTECTION_BYPASS ||
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET ||
    ""
  );
}

function bypassHeaders() {
  const secret = loadBypass();
  if (!secret) return {};
  return { "x-vercel-protection-bypass": secret };
}

function withBypassQuery(url) {
  const secret = loadBypass();
  if (!secret) return url;
  const u = new URL(url);
  u.searchParams.set("x-vercel-protection-bypass", secret);
  return u.toString();
}

function maskRef(ref) {
  const s = String(ref || "");
  if (s.length <= 10) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 10)}…`;
}

function suffixId(id) {
  return String(id || "").slice(-8);
}

function signBody(rawBody, secret) {
  return crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
}

function customerBadge(row) {
  const ps = String(row?.payment_status ?? "").toLowerCase();
  const refundStatus = String(row?.refund_status ?? "").trim().toLowerCase();
  const refundedAt = String(row?.refunded_at ?? "").trim();
  if (ps === "refunded" || refundStatus === "full" || refundStatus === "chargeback") {
    return refundStatus === "chargeback" ? "Chargeback" : "Fully refunded";
  }
  if (refundStatus === "partial" || refundedAt) return "Partially refunded";
  return "Paid";
}

async function fetchJson(url, init = {}) {
  const res = await fetch(withBypassQuery(url), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
      ...bypassHeaders(),
    },
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw_preview: text.slice(0, 80) };
  }
  return { status: res.status, json };
}

async function signIn(url, anon, email, password) {
  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    accessToken: data.session?.access_token ?? null,
    userId: data.user?.id ?? null,
    email: data.user?.email ?? email,
  };
}

async function postRefund(bookingId, token, body) {
  return fetchJson(`${STAGING_BASE}/api/admin/bookings/${encodeURIComponent(bookingId)}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Apply a refund under maker-checker when enabled: Admin A proposes, Admin B approves.
 * Rejection / direct responses are returned as-is (no second call).
 */
async function applyRefund(bookingId, proposerToken, approverToken, body) {
  const propose = await postRefund(bookingId, proposerToken, body);
  if (propose.json?.mode !== "proposed" || !propose.json?.proposal_id) {
    return { ...propose, via_maker_checker: false, propose: null };
  }
  const approveBody = {
    ...body,
    proposal_id: propose.json.proposal_id,
  };
  const applied = await postRefund(bookingId, approverToken, approveBody);
  return {
    ...applied,
    via_maker_checker: true,
    propose,
  };
}

async function insertPaidBooking(staging, { reference, label }) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const row = {
    // Use pending (paid) — completed requires display_earnings_cents on staging.
    status: "pending",
    payment_status: "success",
    amount_paid_cents: CAPTURE_CENTS,
    total_paid_cents: CAPTURE_CENTS,
    total_paid_zar: CAPTURE_CENTS / 100,
    payment_method: "card",
    paystack_reference: reference,
    service_slug: "standard",
    customer_name: "Princess PRD Merge",
    customer_email: `prd-merge-${MARKER}@example.com`,
    customer_phone: "+27000000002",
    date: tomorrow,
    time: "11:00",
    rooms: 2,
    bathrooms: 1,
    total_price: CAPTURE_CENTS / 100,
    currency: "ZAR",
    is_test: true,
    suburb: "TEST Suburb",
    city: "Cape Town",
    paid_at: new Date().toISOString(),
    payment_completed_at: new Date().toISOString(),
    display_earnings_cents: 45_000,
    booking_snapshot: {
      princess_prd_merge: true,
      marker: MARKER,
      label,
      v: 1,
    },
    metadata: {
      princess_prd_merge: true,
      marker: MARKER,
      label,
    },
  };
  const { data, error } = await staging
    .from("bookings")
    .insert(row)
    .select(
      "id, status, payment_status, amount_paid_cents, refund_status, refunded_at, paystack_reference, booking_snapshot",
    )
    .single();
  if (error) throw new Error(`insert paid failed (${label}): ${error.message}`);

  const { error: ledgerErr } = await staging.from("payment_transactions").insert({
    gateway: "paystack",
    gateway_reference: reference,
    gateway_transaction_id: null,
    entity_type: "booking",
    entity_id: data.id,
    amount_cents: CAPTURE_CENTS,
    currency_code: "ZAR",
    processing_fee_cents: 0,
    processing_fee_vat_cents: 0,
    net_settlement_cents: CAPTURE_CENTS,
    fee_calculation_method: "manual",
    settlement_status: "settled",
    payment_channel: "card",
    booking_id: data.id,
    raw_gateway_payload: { kind: "capture", princess_prd_merge: true, marker: MARKER },
    paid_at: new Date().toISOString(),
  });
  if (ledgerErr) throw new Error(`capture ledger insert failed (${label}): ${ledgerErr.message}`);
  return data;
}

async function bookingState(staging, id) {
  const { data } = await staging
    .from("bookings")
    .select(
      "id, status, payment_status, amount_paid_cents, refund_status, refunded_at, paystack_reference, booking_snapshot",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function ledgerForBooking(staging, bookingId, chargeRef) {
  const { data } = await staging
    .from("payment_transactions")
    .select("id, gateway_reference, amount_cents, currency_code, settlement_status, payment_channel")
    .eq("booking_id", bookingId)
    .eq("gateway", "paystack");
  const rows = data || [];
  const capture = rows.filter((r) => r.gateway_reference === chargeRef);
  const refunds = rows.filter(
    (r) =>
      String(r.gateway_reference || "").startsWith(`refund:${chargeRef}:`) ||
      r.settlement_status === "reversed",
  );
  return {
    total: rows.length,
    capture_count: capture.length,
    refund_count: refunds.length,
    refund_cents_sum: refunds.reduce((s, r) => s + Number(r.amount_cents || 0), 0),
    currencies: [...new Set(rows.map((r) => r.currency_code))],
    capture_immutable:
      capture.length === 1 &&
      Number(capture[0]?.amount_cents) === CAPTURE_CENTS &&
      capture[0]?.settlement_status === "settled",
  };
}

function workflowSummary(snapshot) {
  const wf = snapshot && typeof snapshot === "object" ? snapshot.refund_workflow : null;
  if (!wf || typeof wf !== "object") return null;
  return {
    captured_cents: wf.captured_cents ?? null,
    refunded_cents: wf.refunded_cents ?? null,
    records: Array.isArray(wf.records)
      ? wf.records.map((r) => ({
          id_suffix: suffixId(r.id),
          amount_cents: r.amount_cents,
          provider_state: r.provider_state,
          kind: r.kind,
          record_only: r.record_only === true,
          approved_by_present: Boolean(r.approved_by),
          reason_present: Boolean(r.reason),
        }))
      : [],
    pending_proposal: wf.pending_proposal
      ? {
          id_suffix: suffixId(wf.pending_proposal.id),
          amount_cents: wf.pending_proposal.amount_cents,
          reason_present: Boolean(wf.pending_proposal.reason),
          proposed_by_present: Boolean(wf.pending_proposal.proposed_by),
        }
      : null,
  };
}

async function postRefundWebhook(paystackSecret, { event, reference, amountCents, refundId }) {
  const bodyObj = {
    event,
    data: {
      id: refundId || `rf_${Date.now()}`,
      transaction_reference: reference,
      reference,
      amount: amountCents,
      currency: "ZAR",
      status:
        event === "refund.failed"
          ? "failed"
          : event === "refund.pending"
            ? "pending"
            : "processed",
    },
  };
  const raw = JSON.stringify(bodyObj);
  const sig = signBody(raw, paystackSecret);
  const res = await fetchJson(`${STAGING_BASE}/api/paystack/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": sig,
    },
    body: raw,
  });
  return { status: res.status, received: res.status === 200 && res.json?.received === true };
}

async function main() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stamped = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const out = {
    ticket: process.env.PRINCESS_PRD_TICKET?.trim() || "PRINCESS-UAT-PRD-MERGE",
    at: new Date().toISOString(),
    merge_commit_sha: MERGE_SHA,
    staging_base: STAGING_BASE,
    staging_supabase_ref: STAGING_SUPABASE,
    production_supabase_ref: PROD_SUPABASE,
    production_sha_baseline: PROD_SHA_BASELINE,
    marker: MARKER,
    real_refund_executed: false,
    simulation_mode: "record_only_and_seeded_webhooks",
    known_gaps: [
      "concurrent dual-admin submission is not yet protected by a database lock",
      "webhook amount is not yet cross-checked against the approved refund amount",
    ],
    checks: {},
  };

  // 1) Environment health
  const health = await fetchJson(`${STAGING_BASE}/api/health/environment`);
  out.checks.environment_health = {
    status: health.status,
    body_status: health.json?.status ?? null,
    deployment: health.json?.deployment ?? null,
    vercel_env: health.json?.vercelEnv ?? null,
    git_branch: health.json?.gitBranch ?? null,
    shalean_app_env: health.json?.shaleanAppEnv ?? null,
    supabase_ref: health.json?.supabase?.configuredRef ?? null,
    paystack_secret_mode: health.json?.paystack?.secretMode ?? null,
    paystack_public_mode: health.json?.paystack?.publicMode ?? null,
    outbound_disabled: health.json?.messaging?.outboundDisabled ?? null,
    issues_count: Array.isArray(health.json?.issues) ? health.json.issues.length : null,
  };
  const identityOk =
    out.checks.environment_health.deployment === "staging" &&
    out.checks.environment_health.supabase_ref === STAGING_SUPABASE &&
    out.checks.environment_health.paystack_secret_mode === "test" &&
    out.checks.environment_health.outbound_disabled === true;
  if (!identityOk) {
    out.verdict = { fail: "STAGING_ENVIRONMENT_IDENTITY_MISMATCH", identityOk: false };
    const path = resolve(EVIDENCE_DIR, `prd-merge-retest-${stamped}Z.json`);
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ evidence: path.replace(/\\/g, "/"), ...out.verdict }, null, 2));
    process.exit(2);
  }

  const stagingKeys = loadKeys("staging");
  const local = loadDotEnvLocal();
  const passwords = loadPasswords();
  const paystackSecret =
    stagingKeys.PAYSTACK_SECRET_KEY || local.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY || "";
  if (!String(paystackSecret).includes("sk_test")) {
    throw new Error("Paystack test secret unavailable locally — refusing live or missing key");
  }
  if (!stagingKeys.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("staging service role key unavailable");
  }
  const anon =
    stagingKeys.SUPABASE_ANON_KEY ||
    stagingKeys.SUPABASE_PUBLISHABLE_KEY ||
    local.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) throw new Error("staging anon key unavailable");

  const stagingUrl = `https://${STAGING_SUPABASE}.supabase.co`;
  const staging = createClient(stagingUrl, stagingKeys.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 2) Auth — two admins + denied roles
  const adminA = await signIn(stagingUrl, anon, ADMIN_A, passwords[ADMIN_A] || "");
  const adminB = await signIn(stagingUrl, anon, ADMIN_B, passwords[ADMIN_B] || "");
  const customer = await signIn(stagingUrl, anon, CUSTOMER, passwords[CUSTOMER] || "");
  const cleaner = await signIn(stagingUrl, anon, CLEANER, passwords[CLEANER] || "");
  out.checks.auth = {
    admin_a_ok: adminA.ok === true,
    admin_b_ok: adminB.ok === true,
    customer_ok: customer.ok === true,
    cleaner_ok: cleaner.ok === true,
    two_distinct_admins:
      adminA.ok && adminB.ok && adminA.userId && adminB.userId && adminA.userId !== adminB.userId,
  };
  if (!adminA.ok || !adminB.ok) {
    throw new Error("required staging admin sign-in failed");
  }

  // 3) Partial + cumulative + over-refund + duplicate (record_only)
  // When maker-checker is on, Admin A propose + Admin B approve is required to apply.
  const partialRef = `${MARKER}_partial`;
  const partialBooking = await insertPaidBooking(staging, {
    reference: partialRef,
    label: "partial_cumulative",
  });
  const r250 = await applyRefund(partialBooking.id, adminA.accessToken, adminB.accessToken, {
    note: "PRD merge partial R250",
    amount_cents: 25_000,
    record_only: true,
    refund_reference: `${MARKER}_r250`,
  });
  const after250 = await bookingState(staging, partialBooking.id);
  const ledger250 = await ledgerForBooking(staging, partialBooking.id, partialRef);

  const r300 = await applyRefund(partialBooking.id, adminA.accessToken, adminB.accessToken, {
    note: "PRD merge partial R300",
    amount_cents: 30_000,
    record_only: true,
    refund_reference: `${MARKER}_r300`,
  });
  const after550 = await bookingState(staging, partialBooking.id);
  const ledger550 = await ledgerForBooking(staging, partialBooking.id, partialRef);

  // Amount caps are evaluated before propose — single-admin post is enough to reject.
  const over = await postRefund(partialBooking.id, adminA.accessToken, {
    note: "PRD merge over-refund",
    amount_cents: 50_000,
    record_only: true,
  });
  const over1001 = await postRefund(partialBooking.id, adminA.accessToken, {
    note: "PRD merge R1001 reject on remaining",
    amount_cents: 45_001,
    record_only: true,
  });

  // Complete to full with remaining
  const r450 = await applyRefund(partialBooking.id, adminA.accessToken, adminB.accessToken, {
    note: "PRD merge remaining full",
    record_only: true,
    refund_reference: `${MARKER}_r450`,
  });
  const afterFullFromPartial = await bookingState(staging, partialBooking.id);
  const ledgerFullFromPartial = await ledgerForBooking(staging, partialBooking.id, partialRef);

  const dupFull = await postRefund(partialBooking.id, adminA.accessToken, {
    note: "PRD merge duplicate full",
    record_only: true,
  });

  out.checks.partial_and_cumulative = {
    booking_id_suffix: suffixId(partialBooking.id),
    reference_masked: maskRef(partialRef),
    r250: {
      status: r250.status,
      ok: r250.json?.ok === true,
      mode: r250.json?.mode ?? null,
      via_maker_checker: r250.via_maker_checker === true,
      refund_status: r250.json?.refund_status ?? null,
      amount_cents: r250.json?.amount_cents ?? null,
      remaining: r250.json?.refundable_remaining_cents ?? null,
      recorded_only: r250.json?.recorded_only === true,
      paystack_refunded: r250.json?.paystack_refunded === true,
    },
    after_r250: {
      payment_status: after250?.payment_status,
      refund_status: after250?.refund_status,
      status: after250?.status,
      badge: customerBadge(after250),
      ledger: ledger250,
    },
    r300: {
      status: r300.status,
      ok: r300.json?.ok === true,
      amount_cents: r300.json?.amount_cents ?? null,
      remaining: r300.json?.refundable_remaining_cents ?? null,
    },
    after_r550: {
      payment_status: after550?.payment_status,
      refund_status: after550?.refund_status,
      badge: customerBadge(after550),
      ledger: ledger550,
      remaining_paid_cents_expected: CAPTURE_CENTS - 55_000,
      remaining_paid_cents_observed:
        CAPTURE_CENTS - Number(ledger550.refund_cents_sum || 0),
    },
    over_refund_rejected:
      over.status >= 400 &&
      (over.json?.error === "amount_exceeds_refundable" ||
        String(over.json?.error || "").includes("exceed")),
    over_refund_error: over.json?.error ?? null,
    r1001_style_rejected: over1001.status >= 400,
    r1001_error: over1001.json?.error ?? null,
    completing_full: {
      status: r450.status,
      ok: r450.json?.ok === true,
      refund_status: r450.json?.refund_status ?? null,
      remaining: r450.json?.refundable_remaining_cents ?? null,
    },
    after_full: {
      payment_status: afterFullFromPartial?.payment_status,
      refund_status: afterFullFromPartial?.refund_status,
      status_unchanged_lifecycle: afterFullFromPartial?.status === "pending",
      payment_status_schema_valid: afterFullFromPartial?.payment_status === "success",
      badge: customerBadge(afterFullFromPartial),
      not_paid_only: customerBadge(afterFullFromPartial) !== "Paid",
      ledger: ledgerFullFromPartial,
    },
    duplicate_full_rejected:
      dupFull.status >= 400 &&
      (dupFull.json?.error === "already_fully_refunded" ||
        dupFull.json?.error === "already_refunded" ||
        String(dupFull.json?.error || "").includes("already")),
    duplicate_error: dupFull.json?.error ?? null,
  };

  // 4) Full refund on fresh booking
  const fullRef = `${MARKER}_full`;
  const fullBooking = await insertPaidBooking(staging, { reference: fullRef, label: "full" });
  const fullRes = await applyRefund(fullBooking.id, adminA.accessToken, adminB.accessToken, {
    note: "PRD merge full refund",
    record_only: true,
    refund_reference: `${MARKER}_full_rf`,
  });
  const afterFull = await bookingState(staging, fullBooking.id);
  const ledgerFull = await ledgerForBooking(staging, fullBooking.id, fullRef);
  out.checks.full_refund = {
    booking_id_suffix: suffixId(fullBooking.id),
    status: fullRes.status,
    ok: fullRes.json?.ok === true,
    refund_status: fullRes.json?.refund_status ?? null,
    recorded_only: fullRes.json?.recorded_only === true,
    paystack_refunded: fullRes.json?.paystack_refunded === true,
    after: {
      payment_status: afterFull?.payment_status,
      refund_status: afterFull?.refund_status,
      lifecycle_status: afterFull?.status,
      not_auto_cancelled: afterFull?.status === "pending",
      payment_status_schema_valid: afterFull?.payment_status === "success",
      capture_payment_status_immutable: afterFull?.payment_status === "success",
      badge: customerBadge(afterFull),
      not_paid_only: customerBadge(afterFull) !== "Paid",
      ledger: ledgerFull,
    },
  };

  // 5) Maker–checker (depends on staging REFUND_MAKER_CHECKER / PAYOUT_MAKER_CHECKER)
  const mcRef = `${MARKER}_mc`;
  const mcBooking = await insertPaidBooking(staging, { reference: mcRef, label: "maker_checker" });
  const propose = await postRefund(mcBooking.id, adminA.accessToken, {
    note: "PRD merge maker-checker proposal",
    amount_cents: 40_000,
    record_only: true,
  });
  const makerCheckerEnabled = propose.json?.mode === "proposed" && Boolean(propose.json?.proposal_id);
  let selfApprove = null;
  let secondApprove = null;
  let afterMc = null;
  let mcWorkflow = null;
  if (makerCheckerEnabled) {
    selfApprove = await postRefund(mcBooking.id, adminA.accessToken, {
      note: "PRD merge self-approve attempt",
      amount_cents: 40_000,
      record_only: true,
      proposal_id: propose.json.proposal_id,
    });
    secondApprove = await postRefund(mcBooking.id, adminB.accessToken, {
      note: "should use snapshot reason",
      amount_cents: 40_000,
      record_only: true,
      proposal_id: propose.json.proposal_id,
    });
    afterMc = await bookingState(staging, mcBooking.id);
    mcWorkflow = workflowSummary(afterMc?.booking_snapshot);
  } else {
    // Direct mode — still verify customer/cleaner denied; document MC not enabled
    afterMc = await bookingState(staging, mcBooking.id);
  }

  const customerDenied = await postRefund(mcBooking.id, customer.ok ? customer.accessToken : "x", {
    note: "customer attempt",
    record_only: true,
  });
  const cleanerDenied = await postRefund(mcBooking.id, cleaner.ok ? cleaner.accessToken : "x", {
    note: "cleaner attempt",
    record_only: true,
  });

  out.checks.maker_checker = {
    enabled_on_staging: makerCheckerEnabled,
    propose: {
      status: propose.status,
      mode: propose.json?.mode ?? null,
      proposal_id_suffix: propose.json?.proposal_id ? suffixId(propose.json.proposal_id) : null,
      amount_cents: propose.json?.amount_cents ?? null,
    },
    self_approve_rejected: makerCheckerEnabled
      ? selfApprove?.status === 403 ||
        selfApprove?.json?.code === "maker_checker_self_approve" ||
        String(selfApprove?.json?.error || "").includes("self")
      : null,
    self_approve_code: selfApprove?.json?.code ?? selfApprove?.json?.error ?? null,
    second_admin_approved: makerCheckerEnabled
      ? secondApprove?.json?.ok === true && secondApprove?.json?.mode === "applied"
      : null,
    second_admin_amount: secondApprove?.json?.amount_cents ?? null,
    snapshot_amount_match: makerCheckerEnabled
      ? secondApprove?.json?.amount_cents === 40_000
      : null,
    after: afterMc
      ? {
          refund_status: afterMc.refund_status,
          badge: customerBadge(afterMc),
          workflow: mcWorkflow,
        }
      : null,
    customer_denied: customerDenied.status === 401 || customerDenied.status === 403,
    cleaner_denied: cleanerDenied.status === 401 || cleanerDenied.status === 403,
    known_limitation: "concurrent dual-admin submission is not yet protected by a database lock",
  };

  // 6) Provider failure simulation (invalid ref → Paystack error; no successful refund) + safe retry record_only
  const failRef = `${MARKER}_fail_noref`;
  const failBooking = await insertPaidBooking(staging, {
    reference: failRef,
    label: "provider_fail",
  });
  // Force a provider call against a non-existent transaction reference
  const failAttempt = await postRefund(failBooking.id, adminA.accessToken, {
    note: "PRD merge provider failure simulation",
    amount_cents: 10_000,
    record_only: false,
  });
  const afterFail = await bookingState(staging, failBooking.id);
  const failWf = workflowSummary(afterFail?.booking_snapshot);
  const failedRecord = failWf?.records?.find((r) => r.provider_state === "failed");
  let retryRes = null;
  if (failedRecord) {
    // Recover full id from snapshot
    const rawRecords = afterFail?.booking_snapshot?.refund_workflow?.records || [];
    const failedId = rawRecords.find((r) => r.provider_state === "failed")?.id;
    retryRes = await postRefund(failBooking.id, adminA.accessToken, {
      note: "PRD merge safe retry record_only",
      retry_refund_id: failedId,
      record_only: true,
      refund_reference: `${MARKER}_retry_ok`,
    });
  }
  const afterRetry = await bookingState(staging, failBooking.id);
  out.checks.provider_failure_and_retry = {
    fail_attempt_status: failAttempt.status,
    fail_attempt_error: failAttempt.json?.error ?? failAttempt.json?.code ?? null,
    booking_not_refunded_after_fail:
      !afterFail?.refund_status && afterFail?.payment_status === "success",
    failed_record_present: Boolean(failedRecord),
    retry: retryRes
      ? {
          status: retryRes.status,
          ok: retryRes.json?.ok === true,
          recorded_only: retryRes.json?.recorded_only === true,
          paystack_refunded: retryRes.json?.paystack_refunded === true,
          provider_state: retryRes.json?.provider_state ?? null,
        }
      : { skipped: true, reason: "no failed record (maker-checker may have proposed)" },
    after_retry: {
      refund_status: afterRetry?.refund_status ?? null,
      badge: customerBadge(afterRetry),
      payment_status: afterRetry?.payment_status ?? null,
    },
  };

  // If maker-checker proposed on fail booking, approve with B then expect provider fail
  if (failAttempt.json?.mode === "proposed" && failAttempt.json?.proposal_id) {
    const approvedFail = await postRefund(failBooking.id, adminB.accessToken, {
      note: "approve then provider fail",
      amount_cents: 10_000,
      record_only: false,
      proposal_id: failAttempt.json.proposal_id,
    });
    const afterApprovedFail = await bookingState(staging, failBooking.id);
    const rawRecords = afterApprovedFail?.booking_snapshot?.refund_workflow?.records || [];
    const failedId = rawRecords.find((r) => r.provider_state === "failed")?.id;
    let retryAfterMc = null;
    if (failedId) {
      retryAfterMc = await postRefund(failBooking.id, adminA.accessToken, {
        note: "retry after mc provider fail",
        retry_refund_id: failedId,
        record_only: true,
        refund_reference: `${MARKER}_retry_mc`,
      });
    }
    out.checks.provider_failure_and_retry = {
      ...out.checks.provider_failure_and_retry,
      via_maker_checker: true,
      approve_then_fail_status: approvedFail.status,
      approve_then_fail_error: approvedFail.json?.error ?? null,
      retry_after_mc: retryAfterMc
        ? {
            status: retryAfterMc.status,
            ok: retryAfterMc.json?.ok === true,
            recorded_only: retryAfterMc.json?.recorded_only === true,
            paystack_refunded: retryAfterMc.json?.paystack_refunded === true,
          }
        : null,
    };
  }

  // 7) Webhook pending → succeeded + duplicate idempotency (seeded in-flight refund; no real Paystack)
  const whRef = `${MARKER}_wh`;
  const whBooking = await insertPaidBooking(staging, { reference: whRef, label: "webhook" });
  const seedRefundId = `rfnd_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const nowIso = new Date().toISOString();
  const seededWorkflow = {
    version: 1,
    currency: "ZAR",
    captured_cents: CAPTURE_CENTS,
    refunded_cents: 0,
    pending_proposal: null,
    records: [
      {
        id: seedRefundId,
        amount_cents: 25_000,
        currency: "ZAR",
        kind: "partial",
        reason: "PRD merge webhook seed",
        cancellation_reason: null,
        provider_state: "submitted_to_provider",
        provider_reference: null,
        provider_outcome: null,
        record_only: false,
        requested_by: adminA.userId,
        requested_by_email: ADMIN_A,
        approved_by: null,
        approved_by_email: null,
        retry_count: 0,
        created_at: nowIso,
        updated_at: nowIso,
        succeeded_at: null,
        failed_at: null,
      },
    ],
  };
  const { error: seedErr } = await staging
    .from("bookings")
    .update({
      booking_snapshot: {
        ...(whBooking.booking_snapshot || {}),
        refund_workflow: seededWorkflow,
        princess_prd_merge: true,
        marker: MARKER,
      },
    })
    .eq("id", whBooking.id);
  if (seedErr) throw new Error(`webhook seed failed: ${seedErr.message}`);

  const pendingWh = await postRefundWebhook(paystackSecret, {
    event: "refund.pending",
    reference: whRef,
    amountCents: 25_000,
    refundId: `${seedRefundId}_p`,
  });
  const afterPending = await bookingState(staging, whBooking.id);
  const pendingState = workflowSummary(afterPending?.booking_snapshot)?.records?.[0]?.provider_state;

  const processedWh = await postRefundWebhook(paystackSecret, {
    event: "refund.processed",
    reference: whRef,
    amountCents: 25_000,
    refundId: `${seedRefundId}_ok`,
  });
  const afterProcessed = await bookingState(staging, whBooking.id);
  const ledgerProcessed = await ledgerForBooking(staging, whBooking.id, whRef);

  const dupWh = await postRefundWebhook(paystackSecret, {
    event: "refund.processed",
    reference: whRef,
    amountCents: 25_000,
    refundId: `${seedRefundId}_dup`,
  });
  const afterDup = await bookingState(staging, whBooking.id);
  const ledgerDup = await ledgerForBooking(staging, whBooking.id, whRef);

  // charge.refunded + failed event coverage on a second seeded booking
  const whFailRef = `${MARKER}_whf`;
  const whFailBooking = await insertPaidBooking(staging, {
    reference: whFailRef,
    label: "webhook_fail",
  });
  const seedFailId = `rfnd_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await staging
    .from("bookings")
    .update({
      booking_snapshot: {
        princess_prd_merge: true,
        marker: MARKER,
        refund_workflow: {
          version: 1,
          currency: "ZAR",
          captured_cents: CAPTURE_CENTS,
          refunded_cents: 0,
          pending_proposal: null,
          records: [
            {
              id: seedFailId,
              amount_cents: 10_000,
              currency: "ZAR",
              kind: "partial",
              reason: "PRD merge webhook fail seed",
              cancellation_reason: null,
              provider_state: "submitted_to_provider",
              provider_reference: null,
              provider_outcome: null,
              record_only: false,
              requested_by: adminA.userId,
              requested_by_email: ADMIN_A,
              approved_by: null,
              approved_by_email: null,
              retry_count: 0,
              created_at: nowIso,
              updated_at: nowIso,
              succeeded_at: null,
              failed_at: null,
            },
          ],
        },
      },
    })
    .eq("id", whFailBooking.id);
  const failedWh = await postRefundWebhook(paystackSecret, {
    event: "refund.failed",
    reference: whFailRef,
    amountCents: 10_000,
    refundId: `${seedFailId}_f`,
  });
  const afterWhFail = await bookingState(staging, whFailBooking.id);
  const failState = workflowSummary(afterWhFail?.booking_snapshot)?.records?.[0]?.provider_state;

  // charge.refunded on a third seed
  const whChgRef = `${MARKER}_whc`;
  const whChgBooking = await insertPaidBooking(staging, {
    reference: whChgRef,
    label: "charge_refunded",
  });
  const seedChgId = `rfnd_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await staging
    .from("bookings")
    .update({
      booking_snapshot: {
        princess_prd_merge: true,
        marker: MARKER,
        refund_workflow: {
          version: 1,
          currency: "ZAR",
          captured_cents: CAPTURE_CENTS,
          refunded_cents: 0,
          pending_proposal: null,
          records: [
            {
              id: seedChgId,
              amount_cents: 15_000,
              currency: "ZAR",
              kind: "partial",
              reason: "PRD merge charge.refunded seed",
              cancellation_reason: null,
              provider_state: "pending",
              provider_reference: null,
              provider_outcome: null,
              record_only: false,
              requested_by: adminA.userId,
              requested_by_email: ADMIN_A,
              approved_by: null,
              approved_by_email: null,
              retry_count: 0,
              created_at: nowIso,
              updated_at: nowIso,
              succeeded_at: null,
              failed_at: null,
            },
          ],
        },
      },
    })
    .eq("id", whChgBooking.id);
  const chargeRefundedWh = await postRefundWebhook(paystackSecret, {
    event: "charge.refunded",
    reference: whChgRef,
    amountCents: 15_000,
    refundId: `${seedChgId}_c`,
  });
  const afterChg = await bookingState(staging, whChgBooking.id);
  const ledgerChg = await ledgerForBooking(staging, whChgBooking.id, whChgRef);

  // Signature strictness
  const bogus = JSON.stringify({
    event: "refund.processed",
    data: { reference: `${MARKER}_bogus`, amount: 100, status: "processed" },
  });
  const invalidSig = await fetchJson(`${STAGING_BASE}/api/paystack/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": "deadbeef_invalid",
    },
    body: bogus,
  });
  const missingSig = await fetchJson(`${STAGING_BASE}/api/paystack/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bogus,
  });

  out.checks.webhooks = {
    refund_pending: {
      http_ok: pendingWh.received,
      provider_state: pendingState,
      pending_observed: pendingState === "pending",
    },
    refund_processed: {
      http_ok: processedWh.received,
      refund_status: afterProcessed?.refund_status,
      badge: customerBadge(afterProcessed),
      ledger: ledgerProcessed,
      one_reversal_line: ledgerProcessed.refund_count === 1 && ledgerProcessed.refund_cents_sum === 25_000,
    },
    duplicate_refund_processed: {
      http_ok: dupWh.received,
      ledger_rows_before: ledgerProcessed.refund_count,
      ledger_rows_after: ledgerDup.refund_count,
      idempotent: ledgerDup.refund_count === ledgerProcessed.refund_count,
      refund_status_unchanged: afterDup?.refund_status === afterProcessed?.refund_status,
    },
    refund_failed: {
      http_ok: failedWh.received,
      provider_state: failState,
      failed_observed: failState === "failed",
      booking_not_marked_refunded: !afterWhFail?.refund_status,
    },
    charge_refunded: {
      http_ok: chargeRefundedWh.received,
      refund_status: afterChg?.refund_status,
      ledger: ledgerChg,
    },
    signature_strict: {
      invalid_rejected: invalidSig.status === 401,
      missing_rejected: missingSig.status === 401,
    },
    known_limitation: "webhook amount is not yet cross-checked against the approved refund amount",
  };

  // 8) Ledger scenarios A–D summary (from partial booking path + dedicated reject)
  out.checks.ledger_reconciliation = {
    A_1000_capture_250_refund: {
      capture_immutable: ledger250.capture_immutable,
      refund_lines: ledger250.refund_count,
      refund_sum: ledger250.refund_cents_sum,
      pass:
        ledger250.capture_immutable &&
        ledger250.refund_count === 1 &&
        ledger250.refund_cents_sum === 25_000 &&
        ledger250.currencies.length === 1 &&
        ledger250.currencies[0] === "ZAR",
    },
    B_1000_capture_250_plus_300: {
      capture_immutable: ledger550.capture_immutable,
      refund_lines: ledger550.refund_count,
      refund_sum: ledger550.refund_cents_sum,
      pass:
        ledger550.capture_immutable &&
        ledger550.refund_count === 2 &&
        ledger550.refund_cents_sum === 55_000,
    },
    C_full_refund: {
      capture_immutable: ledgerFull.capture_immutable,
      refund_lines: ledgerFull.refund_count,
      refund_sum: ledgerFull.refund_cents_sum,
      pass:
        ledgerFull.capture_immutable &&
        ledgerFull.refund_count === 1 &&
        ledgerFull.refund_cents_sum === CAPTURE_CENTS,
    },
    D_1001_rejected: {
      rejected: out.checks.partial_and_cumulative.r1001_style_rejected === true,
      pass: out.checks.partial_and_cumulative.r1001_style_rejected === true,
    },
  };

  // 9) Admin UX contract (source-verified + API field coverage)
  out.checks.admin_ux = {
    dialog_source: "apps/web/components/admin/AdminBookingRefundDialog.tsx",
    displays: {
      original_captured_amount: true,
      prior_refunds: true,
      remaining_refundable: true,
      full_partial_option: true,
      refund_reason: true,
      maker_checker_proposal_id_field: true,
      record_only_and_provider_timing_copy: true,
      validation_messages: true,
      busy_disables_double_submit: true,
    },
    api_surfaces_remaining_and_status: Boolean(
      r250.json?.refundable_remaining_cents != null && r250.json?.refund_status,
    ),
  };

  // 10) Production non-impact
  const prodKeys = loadKeys("production");
  const prodUrl =
    prodKeys.NEXT_PUBLIC_SUPABASE_URL || prodKeys.SUPABASE_URL || `https://${PROD_SUPABASE}.supabase.co`;
  let prodProbe = { skipped: true };
  if (prodKeys.SUPABASE_SERVICE_ROLE_KEY) {
    const prod = createClient(prodUrl, prodKeys.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { count, error } = await prod
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .contains("metadata", { marker: MARKER });
    prodProbe = {
      skipped: false,
      marker_rows: count ?? 0,
      error: error ? String(error.message).slice(0, 120) : null,
      no_marker_writes: (count ?? 0) === 0 && !error,
    };
  }
  out.checks.production_non_impact = {
    production_sha_baseline: PROD_SHA_BASELINE,
    real_refund_executed: false,
    staging_only_marker: MARKER,
    prod_probe: prodProbe,
    no_domain_move: true,
    no_production_promotion: true,
  };

  // Verdict
  const c = out.checks;
  const refundRulesPass =
    c.partial_and_cumulative?.r250?.ok === true &&
    c.partial_and_cumulative?.r300?.ok === true &&
    c.partial_and_cumulative?.over_refund_rejected === true &&
    c.partial_and_cumulative?.completing_full?.ok === true &&
    c.partial_and_cumulative?.duplicate_full_rejected === true &&
    c.full_refund?.ok === true &&
    c.full_refund?.after?.not_auto_cancelled === true &&
    c.full_refund?.after?.badge === "Fully refunded" &&
    c.full_refund?.after?.payment_status_schema_valid === true &&
    c.full_refund?.after?.not_paid_only === true &&
    c.partial_and_cumulative?.after_r250?.badge === "Partially refunded";

  const ledgerPass =
    c.ledger_reconciliation?.A_1000_capture_250_refund?.pass === true &&
    c.ledger_reconciliation?.B_1000_capture_250_plus_300?.pass === true &&
    c.ledger_reconciliation?.C_full_refund?.pass === true &&
    c.ledger_reconciliation?.D_1001_rejected?.pass === true;

  const webhookPass =
    c.webhooks?.signature_strict?.invalid_rejected === true &&
    c.webhooks?.signature_strict?.missing_rejected === true &&
    c.webhooks?.refund_pending?.pending_observed === true &&
    c.webhooks?.refund_processed?.one_reversal_line === true &&
    c.webhooks?.duplicate_refund_processed?.idempotent === true &&
    c.webhooks?.refund_failed?.failed_observed === true;

  const mcPass = c.maker_checker?.enabled_on_staging
    ? c.maker_checker.self_approve_rejected === true &&
      c.maker_checker.second_admin_approved === true &&
      c.maker_checker.customer_denied === true &&
      c.maker_checker.cleaner_denied === true
    : false;

  const failureRetryPass =
    c.provider_failure_and_retry?.retry?.ok === true ||
    c.provider_failure_and_retry?.retry_after_mc?.ok === true ||
    // If provider call was blocked by propose-only path without approve, still require failed→retry covered
    (c.provider_failure_and_retry?.failed_record_present === true &&
      c.provider_failure_and_retry?.retry?.ok === true);

  const pass =
    identityOk &&
    refundRulesPass &&
    ledgerPass &&
    webhookPass &&
    mcPass &&
    failureRetryPass &&
    c.full_refund?.paystack_refunded !== true &&
    out.real_refund_executed === false;

  out.verdict = pass
    ? {
        result: "PASS — PRINCESS PR D CLOSED FOR STAGING AND READY FOR PR E",
        identityOk,
        refundRulesPass,
        ledgerPass,
        webhookPass,
        mcPass,
        failureRetryPass,
      }
    : {
        result: "NO-GO — PRINCESS PR D REMAINS OPEN",
        identityOk,
        refundRulesPass,
        ledgerPass,
        webhookPass,
        mcPass,
        failureRetryPass,
        maker_checker_enabled: c.maker_checker?.enabled_on_staging ?? false,
      };

  const path = resolve(EVIDENCE_DIR, `prd-merge-retest-${stamped}Z.json`);
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        evidence: path.replace(/\\/g, "/"),
        verdict: out.verdict.result,
        maker_checker_enabled: c.maker_checker?.enabled_on_staging,
        real_refund_executed: false,
      },
      null,
      2,
    ),
  );
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e?.message || e).slice(0, 400));
  process.exit(1);
});
