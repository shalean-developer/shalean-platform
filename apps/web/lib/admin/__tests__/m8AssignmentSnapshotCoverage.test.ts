import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M-8 — assignment snapshot coverage static guard.
 *
 * Every server-side path that mutates cleaner assignment on a booking
 * (`bookings.cleaner_id`, `bookings.payout_owner_cleaner_id`, the
 * `booking_cleaners` roster, or the `selected_cleaner_id` after the
 * pre-payment intake) must be classified here. Each entry declares the
 * earnings-snapshot strategy used by that file:
 *
 *   - `snapshot_via_admin_pipeline`        — calls `runAdminBookingPostCreateNormalizationAndEarnings`.
 *   - `snapshot_via_assignment_helper`     — calls `triggerAssignmentEarningsSnapshotForBooking` (M-8).
 *   - `snapshot_via_persist`               — calls `persistCleanerPayoutIfUnset` directly.
 *   - `snapshot_via_ensure`                — routes through `ensureBookingAssignment`
 *                                            (which calls `persistCleanerPayoutIfUnset` for individual + team).
 *   - `snapshot_via_dispatch_offer_helper` — primitive that does not snapshot itself; its callers must.
 *   - `clears_only`                        — only sets fields to NULL on this path (no new assignment).
 *   - `clears_only_then_ensure`            — clears then delegates to a covered re-dispatch helper.
 *   - `intake_only`                        — pre-payment intake (booking is `pending_payment`; not eligible
 *                                            for monthly assigned earnings until checkout completes).
 *   - `recovery_via_ensure`                — recovery path that re-runs `ensureBookingAssignment`.
 *   - `primitive_caller_handles`           — internal RPC wrapper; callers above already snapshot.
 *
 * If you add a NEW file that mutates `bookings.cleaner_id`,
 * `bookings.payout_owner_cleaner_id`, `bookings.selected_cleaner_id`, or
 * `booking_cleaners`, you MUST add it to this list with the correct
 * classification. New unclassified mutation files will fail the
 * `unclassified assignment mutation source` test below.
 */
type SnapshotCoverage =
  | "snapshot_via_admin_pipeline"
  | "snapshot_via_assignment_helper"
  | "snapshot_via_persist"
  | "snapshot_via_ensure"
  | "snapshot_via_dispatch_offer_helper"
  | "clears_only"
  | "clears_only_then_ensure"
  | "intake_only"
  | "recovery_via_ensure"
  | "primitive_caller_handles"
  | "callee_of_ensure";

type Classification = {
  /** Repo-relative path (POSIX-style). */
  file: string;
  coverage: SnapshotCoverage;
  /** Why this classification applies — kept short so reviewers can scan. */
  rationale: string;
};

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");

const CLASSIFIED_ASSIGNMENT_MUTATION_FILES: Classification[] = [
  {
    file: "apps/web/app/api/admin/bookings/route.ts",
    coverage: "snapshot_via_admin_pipeline",
    rationale: "Admin POST create — final step is runAdminBookingPostCreateNormalizationAndEarnings.",
  },
  {
    file: "apps/web/app/api/admin/bookings/[id]/route.ts",
    coverage: "snapshot_via_persist",
    rationale: "Admin PATCH (cleaner_id / status changes) calls persistCleanerPayoutIfUnset directly.",
  },
  {
    file: "apps/web/app/api/admin/bookings/[id]/cleaners/route.ts",
    coverage: "snapshot_via_assignment_helper",
    rationale: "PUT roster replace; M-8 trigger fires after replace_booking_cleaners_admin_atomic RPC.",
  },
  {
    file: "apps/web/app/api/admin/bookings/[id]/roster/route.ts",
    coverage: "snapshot_via_assignment_helper",
    rationale: "PUT emergency roster replace; M-8 trigger fires after the RPC.",
  },
  {
    file: "apps/web/lib/admin/performAdminAssignToCleaner.ts",
    coverage: "clears_only_then_ensure",
    rationale:
      "Admin manual single-cleaner dispatch clears cleaner_id and creates a dispatch_offer; the actual cleaner_id write happens later in acceptDispatchOffer (which now snapshots).",
  },
  {
    file: "apps/web/lib/admin/performAdminAssignTeam.ts",
    coverage: "snapshot_via_assignment_helper",
    rationale: "Admin manual team override; M-8 trigger fires after assignTeamAndSyncRoster RPC.",
  },
  {
    file: "apps/web/lib/booking/assignTeamAndSyncRoster.ts",
    coverage: "primitive_caller_handles",
    rationale:
      "Thin wrapper around `assign_team_and_sync_roster` RPC. Callers (performAdminAssignTeam + assignTeamToBooking) own the snapshot.",
  },
  {
    file: "apps/web/lib/dispatch/dispatchOffers.ts",
    coverage: "snapshot_via_assignment_helper",
    rationale:
      "acceptDispatchOffer is the only marketplace path that writes cleaner_id + payout_owner_cleaner_id directly; M-8 trigger fires after the assigned-update.",
  },
  {
    file: "apps/web/lib/dispatch/assignTeamToBooking.ts",
    coverage: "callee_of_ensure",
    rationale:
      "Marketplace team dispatch is reached only via assignBooking → ensureBookingAssignment; the latter persists earnings for both team and individual after this returns.",
  },
  {
    file: "apps/web/lib/booking/reassignBookingAfterDecline.ts",
    coverage: "snapshot_via_assignment_helper",
    rationale: "tryOnceReassignAfterDecline writes cleaner_id directly post-decline; M-8 trigger fires after the assignment update.",
  },
  {
    file: "apps/web/lib/booking/upsertBookingFromPaystack.ts",
    coverage: "snapshot_via_persist",
    rationale: "Post-payment booking upsert calls persistCleanerPayoutIfUnset after the assignment branch.",
  },
  {
    file: "apps/web/lib/booking/adminMarkBookingPaid.ts",
    coverage: "snapshot_via_persist",
    rationale: "Admin mark-paid route already calls persistCleanerPayoutIfUnset post-settlement.",
  },
  {
    file: "apps/web/lib/cleaner/runCleanerBookingLifecycleAction.ts",
    coverage: "clears_only_then_ensure",
    rationale:
      "Cleaner reject path nulls cleaner_id then calls ensureBookingAssignment (covers individual + team). Complete path persists earnings via persistCleanerPayoutIfUnset.",
  },
  {
    file: "apps/web/lib/booking/runAssignmentAckTimeouts.ts",
    coverage: "clears_only",
    rationale: "Ack timeout clears cleaner_id; downstream re-dispatch (ensureBookingAssignment) snapshots.",
  },
  {
    file: "apps/web/lib/whatsapp/handleCleanerAssignedBookingReply.ts",
    coverage: "clears_only_then_ensure",
    rationale:
      "WhatsApp decline clears cleaner_id then delegates to tryOnceReassignAfterDecline (which snapshots).",
  },
  {
    file: "apps/web/lib/booking/insertPendingPaymentBooking.ts",
    coverage: "intake_only",
    rationale: "Pre-payment intake only sets selected_cleaner_id; status=pending_payment is not snapshot-eligible.",
  },
  {
    file: "apps/web/lib/booking/insertBookingFlowIntake.ts",
    coverage: "intake_only",
    rationale: "Pre-payment intake; status=pending_payment.",
  },
  {
    file: "apps/web/lib/recurring/insertRecurringOccurrenceBooking.ts",
    coverage: "intake_only",
    rationale: "Recurring occurrence spawn; row begins pending_payment / pending and is not snapshot-eligible until paid + assigned.",
  },
  {
    file: "apps/web/lib/recurring/insertMonthlyRecurringOccurrenceBooking.ts",
    coverage: "intake_only",
    rationale: "Recurring monthly occurrence spawn; same pre-payment lifecycle as per-booking spawn.",
  },
  {
    file: "apps/web/lib/booking/checkoutDispatchOfferFailureFallback.ts",
    coverage: "recovery_via_ensure",
    rationale: "Fallback recovery routes through ensureBookingAssignment (covered).",
  },
  {
    file: "apps/web/lib/dispatch/redispatchAfterOfferReject.ts",
    coverage: "snapshot_via_ensure",
    rationale: "User-selected recovery wave delegates to ensureBookingAssignment which persists earnings.",
  },
  {
    file: "apps/web/lib/dispatch/runDispatchTimeouts.ts",
    coverage: "clears_only_then_ensure",
    rationale: "Dispatch offer timeout clears the offer state; downstream redispatch handlers (ensureBookingAssignment) snapshot.",
  },
];

const MUST_IMPORT_HELPER: Record<string, RegExp[]> = {
  snapshot_via_admin_pipeline: [/runAdminBookingPostCreateNormalizationAndEarnings/],
  snapshot_via_assignment_helper: [/triggerAssignmentEarningsSnapshotForBooking/],
  snapshot_via_persist: [/persistCleanerPayoutIfUnset/],
  snapshot_via_ensure: [/ensureBookingAssignment/],
  recovery_via_ensure: [/ensureBookingAssignment|assignBestCleaner/],
  // The following classifications do not require a snapshot helper import.
  snapshot_via_dispatch_offer_helper: [],
  clears_only: [],
  clears_only_then_ensure: [],
  intake_only: [],
  primitive_caller_handles: [],
  callee_of_ensure: [],
};

function readSourceText(repoRelPath: string): string | null {
  const abs = path.join(REPO_ROOT, repoRelPath);
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/**
 * Strip line + block comments only (string literals stay intact). String
 * arguments to `.from("bookings")` etc. need to remain visible to the
 * scanner. Comments are removed so commented-out code does not produce
 * false positives.
 */
function stripCommentsOnly(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      const nl = src.indexOf("\n", i + 2);
      if (nl < 0) {
        i = n;
      } else {
        out += "\n";
        i = nl + 1;
      }
      continue;
    }
    if (c === "/" && c2 === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) {
        i = n;
      } else {
        out += " ";
        i = end + 2;
      }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const q = c;
      out += c;
      i++;
      while (i < n) {
        out += src[i];
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Roster-table inserts/deletes/upserts and the canonical roster RPCs. */
const ROSTER_MUTATION_RE =
  /\.from\(\s*["']booking_cleaners["']\s*\)\s*\.(insert|delete|upsert)|\brpc\(\s*["'](?:replace_booking_cleaners_admin_atomic|assign_team_and_sync_roster)["']/;

/** Locates `.from("bookings")` so we only consider mutations on the canonical bookings table. */
const BOOKINGS_FROM_RE = /\.from\(\s*["']bookings["']\s*\)/g;

const ASSIGNMENT_FIELD_NAMES = ["cleaner_id", "selected_cleaner_id", "payout_owner_cleaner_id"] as const;

/**
 * Walk forward from `startBraceIndex` (which must point at `{`) and return
 * the index of the matching closing `}` (exclusive end). Returns -1 if
 * unbalanced. Operates on already-stripped code (no strings/comments).
 */
function findMatchingBraceEnd(code: string, startBraceIndex: number): number {
  let depth = 0;
  for (let i = startBraceIndex; i < code.length; i++) {
    const ch = code[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Inside an object-literal body (already stripped of strings/comments), is the
 * given assignment field set to something other than `null`? Returns true even
 * if value parses as `nul...l` due to ambiguity — we err on the side of
 * flagging the file so a human reviewer adds it to the classification list.
 */
function objectLiteralAssignsFieldNonNull(literalBody: string, field: string): boolean {
  const re = new RegExp(`(?:^|[\\s{,])${field}\\s*:`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(literalBody)) != null) {
    const valueStart = m.index + m[0].length;
    let j = valueStart;
    while (j < literalBody.length && /\s/.test(literalBody[j])) j++;
    if (literalBody.slice(j, j + 4) === "null") {
      const after = literalBody[j + 4];
      if (after == null || /[,}\s]/.test(after)) {
        // explicit null — keep scanning for another occurrence
        continue;
      }
    }
    return true;
  }
  return false;
}

/**
 * Detect mutations of `bookings.cleaner_id` / `selected_cleaner_id` /
 * `payout_owner_cleaner_id`. We walk every `.from("bookings").update(…)` /
 * `.from("bookings").insert(…)` / `.from("bookings").upsert(…)` chain,
 * extract the immediate object-literal payload (also array-of-object batch
 * inserts), and check whether any of those fields is assigned to a non-null
 * expression. Also matches roster-table mutations on `booking_cleaners` and
 * the canonical roster RPCs. Other tables (`cleaner_earnings`,
 * `cleaner_change_requests`, etc.) are intentionally ignored.
 */
function fileMutatesAssignment(repoRelPath: string): boolean {
  const text = readSourceText(repoRelPath);
  if (!text) return false;
  const code = stripCommentsOnly(text);

  if (ROSTER_MUTATION_RE.test(code)) return true;

  /**
   * Walk every `.from("bookings")` call. For each occurrence, look at the
   * SEGMENT of code from that `.from(` until the NEXT `.from(` (any table)
   * or end-of-file. Within that segment, search for `.update(`, `.insert(`,
   * or `.upsert(` and inspect the immediate object/array argument. Bounding
   * by the next `.from(` prevents cross-chain false positives like
   * `.from("bookings").select(...) ... .from("reviews").insert({cleaner_id})`.
   */
  const FROM_ANY_RE = /\.from\(/g;
  BOOKINGS_FROM_RE.lastIndex = 0;
  let from: RegExpExecArray | null;
  while ((from = BOOKINGS_FROM_RE.exec(code)) != null) {
    const segStart = from.index + from[0].length;
    FROM_ANY_RE.lastIndex = segStart;
    const nextFrom = FROM_ANY_RE.exec(code);
    const segEnd = nextFrom ? nextFrom.index : code.length;
    const segment = code.slice(segStart, segEnd);

    const verbRe = /\.(?:update|insert|upsert)\s*\(\s*/g;
    let v: RegExpExecArray | null;
    while ((v = verbRe.exec(segment)) != null) {
      const argStart = v.index + v[0].length;
      const ch = segment[argStart];
      if (ch === "[") {
        const end = findMatchingArrayEnd(segment, argStart);
        if (end < 0) continue;
        const arrayBody = segment.slice(argStart + 1, end - 1);
        if (
          ASSIGNMENT_FIELD_NAMES.some((f) =>
            objectLiteralAssignsFieldNonNull(arrayBody, f),
          )
        ) {
          return true;
        }
        continue;
      }
      if (ch !== "{") continue;
      const end = findMatchingBraceEnd(segment, argStart);
      if (end < 0) continue;
      const literalBody = segment.slice(argStart + 1, end - 1);
      if (
        ASSIGNMENT_FIELD_NAMES.some((f) =>
          objectLiteralAssignsFieldNonNull(literalBody, f),
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function findMatchingArrayEnd(code: string, startBracketIndex: number): number {
  let depth = 0;
  for (let i = startBracketIndex; i < code.length; i++) {
    const ch = code[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function* walkSourceFiles(absDir: string): Iterable<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "__tests__" || ent.name === "node_modules") continue;
      yield* walkSourceFiles(full);
    } else if (ent.isFile() && ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts")) {
      yield full;
    }
  }
}

function discoverAssignmentMutationSources(): string[] {
  const roots = [
    path.join(REPO_ROOT, "apps", "web", "app", "api"),
    path.join(REPO_ROOT, "apps", "web", "lib"),
  ];
  const found = new Set<string>();
  for (const root of roots) {
    for (const abs of walkSourceFiles(root)) {
      const rel = path.relative(REPO_ROOT, abs).split(path.sep).join("/");
      if (fileMutatesAssignment(rel)) {
        found.add(rel);
      }
    }
  }
  return [...found].sort();
}

describe("M-8 assignment snapshot coverage (static guard)", () => {
  it("every classified file still exists", () => {
    for (const entry of CLASSIFIED_ASSIGNMENT_MUTATION_FILES) {
      const abs = path.join(REPO_ROOT, entry.file);
      expect(fs.existsSync(abs), `Classified file missing on disk: ${entry.file}`).toBe(true);
    }
  });

  it("every must-snapshot classification imports the declared helper", () => {
    for (const entry of CLASSIFIED_ASSIGNMENT_MUTATION_FILES) {
      const required = MUST_IMPORT_HELPER[entry.coverage];
      if (!required || required.length === 0) continue;
      const text = readSourceText(entry.file);
      expect(text, `cannot read ${entry.file}`).not.toBeNull();
      const code = stripCommentsOnly(text!);
      const matched = required.some((re) => re.test(code));
      expect(
        matched,
        `${entry.file} is classified as "${entry.coverage}" but does not mention any of: ${required
          .map((r) => r.source)
          .join(" | ")}`,
      ).toBe(true);
    }
  });

  it("every assignment-mutation source in the repo is classified", () => {
    const discovered = discoverAssignmentMutationSources();
    const classifiedSet = new Set(CLASSIFIED_ASSIGNMENT_MUTATION_FILES.map((e) => e.file));
    const unclassified = discovered.filter((p) => !classifiedSet.has(p));
    expect(
      unclassified,
      `Unclassified assignment mutation source(s) detected. Add to CLASSIFIED_ASSIGNMENT_MUTATION_FILES with a coverage label and rationale: ${JSON.stringify(unclassified, null, 2)}`,
    ).toEqual([]);
  });

  /**
   * NOTE: there is intentionally no "no stale entries" test. The
   * classification list intentionally includes files whose assignment
   * mutation is performed via a helper-returned patch (e.g. upsert routes
   * that call `buildAutoAssignmentPatch(...)` and feed the result into
   * `.update(...)`); those are not auto-discoverable by an inline-literal
   * scanner. The combination of (a) the unclassified-source test above
   * and (b) the import-helper test below is the actual M-8 invariant.
   */

  it("no two classification entries collide on the same file", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const entry of CLASSIFIED_ASSIGNMENT_MUTATION_FILES) {
      if (seen.has(entry.file)) dupes.push(entry.file);
      seen.add(entry.file);
    }
    expect(dupes, `Duplicate entries: ${JSON.stringify(dupes, null, 2)}`).toEqual([]);
  });
});
