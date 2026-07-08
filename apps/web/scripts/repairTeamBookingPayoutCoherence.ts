/**
 * Repair completed team jobs whose roster was stripped below team_member_count_snapshot.
 *
 *   cd apps/web
 *   npx tsx scripts/repairTeamBookingPayoutCoherence.ts --dry-run
 *   npx tsx scripts/repairTeamBookingPayoutCoherence.ts --booking <uuid>
 *   npx tsx scripts/repairTeamBookingPayoutCoherence.ts --from 2026-07-01 --to 2026-07-31
 */

import "./load-apps-web-env";
import { createClient } from "@supabase/supabase-js";
import {
  listTeamBookingsWithStrippedRoster,
  repairStrippedTeamBookingRoster,
} from "../lib/payout/repairStrippedTeamBookingRoster";

const dryRun = process.argv.includes("--dry-run");

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx > -1 && process.argv[idx + 1]) return process.argv[idx + 1]!.trim();
  return null;
}

const singleBookingId = readArg("--booking");
const from = readArg("--from");
const to = readArg("--to");

/** Hlengiwe Myanga deep clean — participants restored from payout persist logs (2026-07-06). */
const HLENGIWE_BOOKING_ID = "53ba9d3f-6a33-487b-87fb-66983f4b9dae";
const HLENGIWE_PARTICIPANTS = [
  "015e91e8-df25-4fde-8db1-a5901b005ae3", // Lorraine Moyo (lead)
  "ac73ea99-48b3-4c30-9d6b-5a8beab40f33", // Mavis Thandeka Gurajena
  "d8a75570-4b3f-44bc-848a-ad9f33857c91", // Estery Phiri
];

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase credentials.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const targets: Array<{ bookingId: string; participants?: string[]; leadCleanerId?: string }> = [];

  if (singleBookingId) {
    targets.push({ bookingId: singleBookingId });
  } else {
    const stripped = await listTeamBookingsWithStrippedRoster(admin, {
      from: from ?? undefined,
      to: to ?? undefined,
      limit: 500,
    });
    for (const row of stripped) {
      const participants =
        row.bookingId === HLENGIWE_BOOKING_ID ? [...HLENGIWE_PARTICIPANTS] : undefined;
      targets.push({
        bookingId: row.bookingId,
        participants,
        leadCleanerId: row.bookingId === HLENGIWE_BOOKING_ID ? HLENGIWE_PARTICIPANTS[0] : undefined,
      });
    }
  }

  if (!targets.length) {
    console.log("[repair-team-payout] no stripped team bookings found");
    return;
  }

  console.log(`[repair-team-payout] ${targets.length} candidate(s)${dryRun ? " (DRY-RUN)" : ""}`);

  for (const target of targets) {
    if (dryRun) {
      console.log(`[repair-team-payout][dry] would repair ${target.bookingId}`);
      continue;
    }

    let participants = target.participants;
    if (!participants?.length) {
      console.warn(
        `[repair-team-payout][skip] ${target.bookingId} — no participant list (pass --booking with manual repair)`,
      );
      continue;
    }

    const result = await repairStrippedTeamBookingRoster({
      admin,
      bookingId: target.bookingId,
      participantCleanerIds: participants,
      leadCleanerId: target.leadCleanerId ?? participants[0],
      source: "scripts/repairTeamBookingPayoutCoherence",
    });

    if (!result.ok) {
      console.error(`[repair-team-payout][fail] ${target.bookingId}: ${result.error}`);
      continue;
    }
    console.log(
      `[repair-team-payout][ok] ${target.bookingId} restored ${result.restoredCleanerIds?.join(", ") ?? ""}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
