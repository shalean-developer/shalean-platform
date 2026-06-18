import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { deriveCleanerJobUiState } from "@/lib/cleaner/cleanerMobileBookingMap";
import { directionsHrefFromQuery } from "@/lib/cleaner/directionsHref";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import type { OperationalLifecycleQueueAction } from "@/lib/booking/describeBookingOperationalState";

export type CleanerJobPrimaryLifecycleAction = Extract<
  OperationalLifecycleQueueAction,
  "accept" | "en_route" | "start" | "complete"
>;

export type CleanerJobPrimaryCta =
  | { kind: "hidden" }
  | { kind: "maps"; label: "Navigate"; href: string }
  | {
      kind: "lifecycle";
      label: string;
      action: CleanerJobPrimaryLifecycleAction;
      /** Open maps in the same user activation before POST (On my way). */
      mapsHref?: string;
      requiresConfirm?: boolean;
    };

export type DeriveCleanerJobPrimaryCtaInput = {
  row: CleanerBookingRow;
  nowMs?: number;
  mapsQuery?: string | null;
};

function jobDateYmd(row: CleanerBookingRow): string {
  return String(row.date ?? "").trim().slice(0, 10);
}

function resolveMapsHref(mapsQuery: string | null | undefined): string | null {
  const q = String(mapsQuery ?? "").trim();
  if (!q) return null;
  const href = directionsHrefFromQuery(q);
  return href || null;
}

/**
 * Single primary CTA for cleaner job cards — label and behavior follow lifecycle
 * phase plus a Johannesburg booking-day gate (Navigate before the day; On my way on the day).
 */
export function deriveCleanerJobPrimaryCta(input: DeriveCleanerJobPrimaryCtaInput): CleanerJobPrimaryCta {
  const { row, nowMs = Date.now(), mapsQuery } = input;
  const ui = deriveCleanerJobUiState(row, { nowMs });
  const mapsHref = resolveMapsHref(mapsQuery ?? String(row.location ?? "").split(/\r?\n/)[0]?.trim());

  switch (ui.phase) {
    case "accept":
      return { kind: "lifecycle", label: "Accept job", action: "accept" };
    case "on_my_way": {
      const jobYmd = jobDateYmd(row);
      const todayYmd = johannesburgCalendarYmd(new Date(nowMs));
      if (jobYmd && todayYmd && jobYmd > todayYmd) {
        if (!mapsHref) return { kind: "hidden" };
        return { kind: "maps", label: "Navigate", href: mapsHref };
      }
      return {
        kind: "lifecycle",
        label: "On my way",
        action: "en_route",
        mapsHref: mapsHref ?? undefined,
      };
    }
    case "start":
      return { kind: "lifecycle", label: "In progress", action: "start" };
    case "complete":
      return {
        kind: "lifecycle",
        label: "Complete job",
        action: "complete",
        requiresConfirm: true,
      };
    case "expired":
    case "none":
    default:
      return { kind: "hidden" };
  }
}
