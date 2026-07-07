import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dir, "../.env.local"), "utf8");
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL = ["completed", "cancelled", "failed", "payment_expired", "pending_payment"];

function normalizeUuid(v) {
  const s = v != null ? String(v).trim() : "";
  return UUID_RE.test(s) ? s : null;
}

function cleanerPatch(cleanerId, status) {
  const st = String(status ?? "").trim().toLowerCase();
  if (st === "pending_payment") {
    return { selected_cleaner_id: cleanerId, assignment_type: "user_selected", cleaner_id: null };
  }
  const now = new Date().toISOString();
  return {
    selected_cleaner_id: cleanerId,
    cleaner_id: cleanerId,
    assignment_type: "user_selected",
    status: "assigned",
    assigned_at: now,
    cleaner_response_status: "pending",
    dispatch_status: "assigned",
  };
}

async function lastCleaner(admin, planId) {
  const { data } = await admin
    .from("bookings")
    .select("cleaner_id, selected_cleaner_id")
    .eq("recurring_id", planId)
    .neq("status", "cancelled")
    .order("date", { ascending: false })
    .limit(20);
  for (const row of data ?? []) {
    const c = normalizeUuid(row.cleaner_id);
    if (c) return c;
    const s = normalizeUuid(row.selected_cleaner_id);
    if (s) return s;
  }
  return null;
}

async function lastRoster(admin, planId) {
  const { data } = await admin
    .from("bookings")
    .select("cleaner_id, cleaner_count, booking_cleaners(cleaner_id, role, payout_weight, lead_bonus_cents, source)")
    .eq("recurring_id", planId)
    .neq("status", "cancelled")
    .order("date", { ascending: false })
    .limit(30);
  for (const row of data ?? []) {
    const join = Array.isArray(row.booking_cleaners) ? row.booking_cleaners : [];
    if (join.length < 2) continue;
    const rows = [];
    let lead = null;
    for (const bc of join) {
      const id = normalizeUuid(bc.cleaner_id);
      if (!id) continue;
      const role = String(bc.role ?? "").toLowerCase() === "lead" ? "lead" : "member";
      if (role === "lead") lead = id;
      rows.push({
        cleaner_id: id,
        role,
        payout_weight: Number(bc.payout_weight ?? 1) || 1,
        lead_bonus_cents: Math.floor(Number(bc.lead_bonus_cents ?? 0)) || 0,
        source: String(bc.source ?? "").trim() || "recurring_continuity",
      });
    }
    if (rows.length >= 2 && lead && rows.filter((r) => r.role === "lead").length === 1) {
      return { lead, count: Math.max(rows.length, Number(row.cleaner_count ?? rows.length)), rows };
    }
  }
  return null;
}

async function applyRoster(admin, bookingId, planId, leadFallback) {
  const { data: b } = await admin
    .from("bookings")
    .select("team_id, is_team_job, cleaner_line_earnings_finalized_at, booking_cleaners(cleaner_id)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || b.is_team_job || b.team_id || b.cleaner_line_earnings_finalized_at) return false;
  if (Array.isArray(b.booking_cleaners) && b.booking_cleaners.length >= 2) return false;

  const roster = await lastRoster(admin, planId);
  if (!roster) return false;

  const { error: rpcErr } = await admin.rpc("replace_booking_cleaners_admin_atomic", {
    p_booking_id: bookingId,
    p_rows: roster.rows,
  });
  if (rpcErr) {
    console.error("Roster RPC", bookingId, rpcErr.message);
    return false;
  }

  const lead = roster.lead || leadFallback;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("bookings")
    .update({
      cleaner_id: lead,
      selected_cleaner_id: lead,
      payout_owner_cleaner_id: lead,
      cleaner_mode: "individual_cleaners",
      cleaner_count: roster.count,
      status: "assigned",
      assigned_at: now,
      cleaner_response_status: "pending",
      dispatch_status: "assigned",
      is_team_job: false,
      team_id: null,
    })
    .eq("id", bookingId);
  if (error) {
    console.error("Roster patch", bookingId, error.message);
    return false;
  }
  return true;
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: stuck } = await admin
    .from("bookings")
    .select("id, recurring_id, selected_cleaner_id, status")
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .is("team_id", null)
    .gte("date", "2026-07-01")
    .lte("date", "2026-07-31")
    .not("status", "in", `(${TERMINAL.join(",")})`);

  let updated = 0;
  let rosters = 0;
  let skipped = 0;
  const planCache = new Map();

  for (const row of stuck ?? []) {
    let cleanerId = normalizeUuid(row.selected_cleaner_id);
    if (!cleanerId && row.recurring_id) {
      if (!planCache.has(row.recurring_id)) {
        planCache.set(row.recurring_id, await lastCleaner(admin, row.recurring_id));
      }
      cleanerId = planCache.get(row.recurring_id);
    }
    if (!cleanerId) {
      skipped++;
      continue;
    }

    const patch = cleanerPatch(cleanerId, row.status);
    const { error } = await admin.from("bookings").update(patch).eq("id", row.id);
    if (error) {
      console.error("Patch failed", row.id, error.message);
      skipped++;
      continue;
    }
    updated++;

    if (row.recurring_id && (await applyRoster(admin, row.id, row.recurring_id, cleanerId))) {
      rosters++;
    }
  }

  const { count: remaining } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .is("team_id", null)
    .gte("date", "2026-07-01")
    .lte("date", "2026-07-31")
    .not("status", "in", `(${TERMINAL.join(",")})`);

  console.log({ updated, skipped, rostersApplied: rosters, remaining: remaining ?? 0 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
