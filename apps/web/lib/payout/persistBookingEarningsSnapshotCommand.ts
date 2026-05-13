import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  persistCleanerPayoutIfUnset,
  type PersistCleanerPayoutIfUnsetResult,
} from "@/lib/payout/persistCleanerPayout";

export type PersistBookingEarningsSnapshotCommandParams = {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  forceDisplayRecompute?: boolean;
};

/**
 * Command boundary for booking earnings snapshot persistence.
 * Phase 1B deliberately delegates to the existing persist path unchanged so
 * payout guards, idempotency, calculations, and write conditions stay owned
 * by persistCleanerPayoutIfUnset.
 */
export async function persistBookingEarningsSnapshotCommand(
  params: PersistBookingEarningsSnapshotCommandParams,
): Promise<PersistCleanerPayoutIfUnsetResult> {
  return persistCleanerPayoutIfUnset(params);
}
