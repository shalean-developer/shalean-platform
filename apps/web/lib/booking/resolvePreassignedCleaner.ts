import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

function pickCleanerIdRaw(
  snapshot: BookingSnapshotV1 | null,
  paystackMetadata?: Record<string, string | undefined> | null,
): string {
  const locked = snapshot?.locked;
  const fromLocked =
    locked && typeof locked === "object" && !Array.isArray(locked) && "cleaner_id" in locked
      ? (locked as { cleaner_id?: unknown }).cleaner_id
      : null;
  const fromSnapshot = snapshot?.cleaner_id;
  const fromMeta = paystackMetadata?.cleaner_id;
  for (const v of [fromLocked, fromSnapshot, fromMeta]) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  return "";
}

/**
 * Resolves a customer-selected cleaner from checkout snapshot / Paystack metadata to a real `cleaners.id`.
 * Returns null when unset or the id does not exist (invalid roster id, typo, etc.).
 */
export async function resolvePreassignedCleanerId(
  supabase: SupabaseClient,
  snapshot: BookingSnapshotV1 | null,
  paystackMetadata?: Record<string, string | undefined> | null,
): Promise<string | null> {
  const raw = pickCleanerIdRaw(snapshot, paystackMetadata ?? null);
  if (!raw) return null;

  const { data: row, error } = await supabase.from("cleaners").select("id").eq("id", raw).maybeSingle();
  if (error) {
    console.warn("Invalid preassigned cleaner lookup", { raw, message: error.message });
    await reportOperationalIssue("warn", "resolvePreassignedCleanerId", `cleaner lookup failed: ${error.message}`, {
      raw,
    });
    return null;
  }
  if (!row || typeof row !== "object" || !("id" in row)) {
    console.warn("Invalid preassigned cleaner_id", { raw });
    void logSystemEvent({
      level: "warn",
      source: "INVALID_PREASSIGNED_CLEANER",
      message: "Checkout cleaner id does not match any cleaners row",
      context: { raw },
    });
    await reportOperationalIssue("warn", "resolvePreassignedCleanerId", "Invalid preassigned cleaner_id (not in cleaners)", {
      raw,
    });
    return null;
  }
  return String((row as { id: string }).id);
}
