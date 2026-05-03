import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

/** Monotonic ordering for `cleaner_response_status` lifecycle (reject resets handled separately). */
const RESPONSE_RANK: Record<string, number> = {
  [CLEANER_RESPONSE.NONE]: 0,
  [CLEANER_RESPONSE.PENDING]: 1,
  [CLEANER_RESPONSE.ACCEPTED]: 2,
  [CLEANER_RESPONSE.ON_MY_WAY]: 3,
  [CLEANER_RESPONSE.STARTED]: 4,
  [CLEANER_RESPONSE.COMPLETED]: 5,
  [CLEANER_RESPONSE.DECLINED]: -1,
  [CLEANER_RESPONSE.TIMEOUT]: -1,
};

function responseRank(raw: string | null | undefined): number {
  const k = raw == null || raw === "" ? "" : String(raw).trim().toLowerCase();
  if (k in RESPONSE_RANK) return RESPONSE_RANK[k]!;
  return 0;
}

/**
 * Returns true when `next` is strictly ahead of `current` (or equal and idempotent ok).
 * Used to ignore accidental downgrades from duplicate requests.
 */
export function cleanerResponseAllowsProgression(
  current: string | null | undefined,
  next: string,
  opts?: { allowEqual?: boolean },
): boolean {
  const a = responseRank(current);
  const b = responseRank(next);
  if (b < 0) return true;
  if (opts?.allowEqual) return b >= a;
  return b > a;
}
