import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function normService(row) {
  const snapshotService =
    row?.booking_snapshot?.locked &&
    typeof row.booking_snapshot.locked.service === "string"
      ? row.booking_snapshot.locked.service
      : null;
  return String(snapshotService ?? row?.service ?? "")
    .trim()
    .toLowerCase();
}

function fail(step, message, details) {
  console.error(`FAIL ${step}: ${message}`);
  if (details !== undefined) {
    console.error(JSON.stringify(details, null, 2));
  }
  process.exit(1);
}

function pass(step, message, details) {
  console.log(`PASS ${step}: ${message}`);
  if (details !== undefined) {
    console.log(JSON.stringify(details, null, 2));
  }
}

async function run() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appBaseUrl = process.env.OPS_APP_BASE_URL || "http://localhost:3000";
  // Prefer CRON_SECRET for ops smoke to match dispatch route contract.
  const adminToken = process.env.CRON_SECRET || process.env.ADMIN_SECRET || "";
  const dispatchTestBookingId = process.env.OPS_DISPATCH_TEST_BOOKING_ID || "";

  console.log("OPS_APP_BASE_URL:", process.env.OPS_APP_BASE_URL || "missing (using default http://localhost:3000)");
  console.log(
    "OPS_DISPATCH_TEST_BOOKING_ID:",
    process.env.OPS_DISPATCH_TEST_BOOKING_ID ? "present" : "missing",
  );
  console.log("CRON_SECRET:", process.env.CRON_SECRET ? "present" : "missing");

  if (!supabaseUrl || !serviceRoleKey) {
    fail(
      "INIT",
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log("--- OPS SMOKE CHECKLIST START ---");

  // Step 1: Team and member coverage.
  console.log("Step 1: Teams");
  const teamsRes = await supabase
    .from("teams")
    .select("id,name,service_type,is_active,capacity_per_day")
    .eq("is_active", true);
  if (teamsRes.error) fail(1, "teams query failed", teamsRes.error);

  const teams = teamsRes.data ?? [];
  const byService = {};
  for (const team of teams) {
    byService[team.service_type] = (byService[team.service_type] || 0) + 1;
  }
  if ((byService.deep_cleaning || 0) < 3) {
    fail(1, "deep_cleaning < 3 active teams", byService);
  }

  const membersRes = await supabase.from("team_members").select("id,team_id");
  if (membersRes.error) fail(1, "team_members query failed", membersRes.error);

  const memberCountByTeam = {};
  for (const member of membersRes.data ?? []) {
    memberCountByTeam[member.team_id] = (memberCountByTeam[member.team_id] || 0) + 1;
  }
  const zeroMembers = teams
    .filter((team) => (memberCountByTeam[team.id] || 0) === 0)
    .map((team) => ({ id: team.id, name: team.name }));
  if (zeroMembers.length) fail(1, "active team has zero members", zeroMembers);

  const lowMembers = teams
    .filter((team) => (memberCountByTeam[team.id] || 0) < 2)
    .map((team) => ({
      id: team.id,
      name: team.name,
      members: memberCountByTeam[team.id] || 0,
    }));
  if (lowMembers.length) fail(1, "active team has <2 members", lowMembers);
  pass(1, "team coverage OK", { byService });

  // Step 2: Service cap completeness and sanity.
  console.log("Step 2: Caps");
  const bookingsRes = await supabase
    .from("bookings")
    .select("service,booking_snapshot")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (bookingsRes.error) fail(2, "bookings query failed", bookingsRes.error);

  const requiredServices = [
    ...new Set((bookingsRes.data ?? []).map(normService).filter(Boolean)),
  ];

  const capsRes = await supabase
    .from("service_earning_caps")
    .select("service_id,cap_cents,is_active")
    .eq("is_active", true);
  if (capsRes.error) fail(2, "service_earning_caps query failed", capsRes.error);

  const activeCaps = capsRes.data ?? [];
  const capServiceIds = new Set(
    activeCaps.map((cap) => String(cap.service_id || "").trim().toLowerCase()).filter(Boolean),
  );
  const missingCaps = requiredServices.filter((serviceId) => !capServiceIds.has(serviceId));
  if (missingCaps.length) fail(2, "missing active caps", missingCaps);

  const invalidCaps = activeCaps
    .filter((cap) => !(Number.isFinite(Number(cap.cap_cents)) && Number(cap.cap_cents) > 0))
    .map((cap) => ({ service_id: cap.service_id, cap_cents: cap.cap_cents }));
  if (invalidCaps.length) fail(2, "invalid cap values", invalidCaps);

  const capCounts = {};
  for (const cap of activeCaps) {
    const key = String(cap.service_id || "").trim().toLowerCase();
    capCounts[key] = (capCounts[key] || 0) + 1;
  }
  const duplicateCaps = Object.entries(capCounts)
    .filter(([, count]) => count > 1)
    .map(([service_id, count]) => ({ service_id, count }));
  if (duplicateCaps.length) fail(2, "duplicate active caps", duplicateCaps);

  pass(2, "cap coverage and validity OK", { requiredServices });

  // Step 3: Booking integrity for deep team flow.
  console.log("Step 3: Deep bookings integrity");
  const deepRes = await supabase
    .from("bookings")
    .select("id,service,is_team_job,team_id,cleaner_id,created_at,booking_snapshot")
    .order("created_at", { ascending: false })
    .limit(250);
  if (deepRes.error) fail(3, "bookings deep sample query failed", deepRes.error);

  const deepSample = (deepRes.data ?? []).filter((row) => normService(row).includes("deep")).slice(0, 25);
  const invalidDeepRows = deepSample.filter(
    (row) => row.is_team_job === true && (!row.team_id || row.cleaner_id !== null),
  );
  if (invalidDeepRows.length) fail(3, "invalid deep team-assignment rows", invalidDeepRows);

  pass(3, "deep booking rows valid", {
    sampleCount: deepSample.length,
    teamJobCount: deepSample.filter((row) => row.is_team_job === true).length,
  });

  // Step 4: Team payouts consistency.
  console.log("Step 4: Team payouts");
  const teamBookingsRes = await supabase
    .from("bookings")
    .select("id,team_id,created_at")
    .eq("is_team_job", true)
    .order("created_at", { ascending: false })
    .limit(30);
  if (teamBookingsRes.error) fail(4, "team bookings query failed", teamBookingsRes.error);

  const teamBookings = teamBookingsRes.data ?? [];
  if (teamBookings.length > 0) {
    const bookingIds = teamBookings.map((booking) => booking.id);
    const payoutsRes = await supabase
      .from("team_job_member_payouts")
      .select("booking_id,payout_cents")
      .in("booking_id", bookingIds);
    if (payoutsRes.error) fail(4, "team payouts query failed", payoutsRes.error);

    const payouts = payoutsRes.data ?? [];
    const wrongPayoutCents = payouts.filter((payout) => Number(payout.payout_cents) !== 25000);
    if (wrongPayoutCents.length) fail(4, "team payout_cents must be 25000", wrongPayoutCents);

    const teamMembersRes = await supabase.from("team_members").select("team_id,id");
    if (teamMembersRes.error) fail(4, "team_members query failed", teamMembersRes.error);
    const expectedByTeam = {};
    for (const member of teamMembersRes.data ?? []) {
      expectedByTeam[member.team_id] = (expectedByTeam[member.team_id] || 0) + 1;
    }

    const payoutRowsByBooking = {};
    for (const payout of payouts) {
      payoutRowsByBooking[payout.booking_id] = (payoutRowsByBooking[payout.booking_id] || 0) + 1;
    }

    const rowMismatches = [];
    for (const booking of teamBookings) {
      const expected = expectedByTeam[booking.team_id] || 0;
      const actual = payoutRowsByBooking[booking.id] || 0;
      if (expected !== actual) {
        rowMismatches.push({
          booking_id: booking.id,
          team_id: booking.team_id,
          payout_rows: actual,
          expected_members: expected,
        });
      }
    }
    if (rowMismatches.length) fail(4, "team payout rows mismatch team members", rowMismatches);
  }

  pass(4, "team payouts consistent", { teamBookingsChecked: teamBookings.length });

  // Step 5: Capacity usage sanity.
  console.log("Step 5: Capacity");
  const capacityRes = await supabase
    .from("team_daily_capacity_usage")
    .select("team_id,booking_date,used_slots,teams!inner(id,name,capacity_per_day)")
    .order("booking_date", { ascending: false })
    .limit(50);
  if (capacityRes.error) fail(5, "team_daily_capacity_usage query failed", capacityRes.error);

  const exceeded = (capacityRes.data ?? []).filter(
    (row) => Number(row.used_slots) > Number(row.teams.capacity_per_day),
  );
  if (exceeded.length) fail(5, "used_slots exceeds capacity_per_day", exceeded);
  pass(5, "capacity usage valid", { rows: (capacityRes.data ?? []).length });

  // Step 6: API smoke (optional if booking id/token not provided).
  console.log("Step 6: API");
  if (!dispatchTestBookingId || !adminToken) {
    pass(6, "API smoke skipped (set OPS_DISPATCH_TEST_BOOKING_ID + ADMIN_SECRET to enable)");
  } else {
    console.log("Using CRON_SECRET:", process.env.CRON_SECRET ? "present" : "missing");
    const response = await fetch(`${appBaseUrl}/api/dispatch/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ bookingId: dispatchTestBookingId }),
    });

    const body = await response.text();
    if (response.status >= 400) {
      console.error("Dispatch API response", {
        status: response.status,
        body,
      });
      fail(6, `API smoke failed with status ${response.status}`, {
        status: response.status,
        body,
      });
    }
    pass(6, "dispatch API reachable", { status: response.status, body });
  }

  // Step 7: Logs quick health.
  console.log("Step 7: Logs");
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const logsRes = await supabase
    .from("system_logs")
    .select("source,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (logsRes.error) {
    pass(7, "log check skipped (system_logs unavailable)", { reason: logsRes.error.message });
  } else {
    const counts = {};
    for (const log of logsRes.data ?? []) {
      counts[log.source] = (counts[log.source] || 0) + 1;
    }
    pass(7, "log check completed", { counts });
  }

  console.log("--- OPS SMOKE CHECKLIST PASS ---");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
