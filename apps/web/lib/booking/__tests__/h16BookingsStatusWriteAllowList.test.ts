import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * H-16: `bookings.status` direct-write allow-list (lifecycle bypass detection).
 *
 * --------------------------------------------------------------------------
 * WHY THIS GUARD EXISTS
 * --------------------------------------------------------------------------
 * Direct writes to `bookings.status` outside the approved lifecycle/integrity
 * helpers risk bypassing:
 *   - lifecycle alignment (status ↔ completed_at ↔ dispatch_status)
 *   - payout eligibility (display_earnings_cents must be persisted before
 *     completion can be observed by cleaner-facing surfaces)
 *   - cleaner assignment invariants (cleaner_id / payout_owner_cleaner_id /
 *     selected_cleaner_id consistency, see `bookings_assigned_requires_status`)
 *   - dashboard-facing operational phase (`deriveBookingOperationalPhase`)
 *   - notifications fan-out (`notifyBookingEvent`)
 *
 * The audit (H-16) enumerates every call site in TS/SQL that mutates
 * `bookings.status`, classifies each, and pins down an explicit allow-list of
 * files. New files that introduce direct `bookings.status` writes (or new
 * direct writes inside non-allowed files) MUST be wired through one of the
 * approved helpers below — or, if a genuinely new lifecycle path is being
 * added, this allow-list must be updated in the same PR with reviewer
 * acknowledgement.
 *
 * --------------------------------------------------------------------------
 * APPROVED HELPERS / GATEWAYS (canonical write surfaces)
 * --------------------------------------------------------------------------
 *   Lifecycle helpers (cleaner-side state transitions + paid-booking auto-assign):
 *   - `lib/booking/bookingCompletionIntegrity.ts#buildCompletionCoherencePatch`
 *       Atomic patch fragment to merge with `status: "completed"` (heals
 *       `completed_at` + `dispatch_status` funnel drift).
 *   - `lib/cleaner/cleanerLifecycleBookingCommands.ts`
 *       Cleaner-side lifecycle command boundary (accept / reject / en_route / start / complete).
 *       Internally calls `buildCompletionCoherencePatch` for completion.
 *   - `lib/booking/assignmentBookingStateCommands.ts`
 *       Phase-1H command boundary for assignment/reassignment booking-state
 *       writes. Assignment orchestrators delegate here rather than issuing
 *       direct `bookings.status` updates inline.
 *   - `lib/dispatch/dispatchOffers.ts#acceptDispatchOffer`
 *       Cleaner accepts a dispatch offer (pending/pending_assignment/offered → assigned).
 *   - `lib/whatsapp/handleCleanerAssignedBookingReply.ts`
 *       Cleaner WhatsApp accept/decline (parallel channel to the in-app
 *       lifecycle action). Decline routes through `tryOnceReassignAfterDecline`;
 *       accept transitions assigned → confirmed. Conditional updates use
 *       `eq("status", "assigned")` to prevent races with concurrent in-app actions.
 *   - `lib/dispatch/escalatePendingAck.ts`
 *       Ack-timeout escalation: when a cleaner does not acknowledge an
 *       assignment within `PENDING_ACK_ESCALATE_MS`, delegates the guarded
 *       clear/fail booking write to `assignmentBookingStateCommands.ts` and
 *       re-dispatches via `ensureBookingAssignment`. Conditional update uses
 *       `eq("cleaner_response_status", "pending")` to avoid races with accept.
 *   - `lib/booking/runAssignmentAckTimeouts.ts`
 *       Stale-assigned release: assigned + assigned_at older than the ack
 *       cutoff → pending_assignment via `assignmentBookingStateCommands.ts`,
 *       then `tryOnceReassignAfterDecline`.
 *
 *   Integrity / invariant helpers:
 *   - `lib/admin/adminBookingPostCreatePipeline.ts#ensureBookingAssignedStatusInvariant`
 *       Mirrors DB constraint `bookings_assigned_requires_status`
 *       (pending + cleaner_ref → assigned).
 *   - `lib/payout/adminBookingAssignmentEarningsGate.ts#revertAdminBookingAssignmentToBeforeRow`
 *       Reverts an admin assignment when the earnings preflight gate fails.
 *   - `lib/booking/adminEditBookingDetails.ts`
 *       Admin edit re-aligns paid-with-cleaner row to assigned (mirrors
 *       `ensureBookingAssignedStatusInvariant`).
 *
 *   Admin manual safe paths:
 *   - `lib/booking/adminMarkBookingPaid.ts`
 *       Admin manual mark-paid (pending_payment → pending/assigned).
 *   - `lib/admin/adminManualBookingOfferCommand.ts#setAdminManualBookingOffered`
 *       Phase-1D command boundary that holds the only direct
 *       `bookings.update({ status: "offered", ... })` write for the admin
 *       manual single-cleaner-offer path. `performAdminAssignToCleaner.ts`
 *       (the orchestrator) used to inline this write but now delegates to
 *       this command — keeping the lifecycle bypass surface narrowly bounded
 *       to one auditable function. The orchestrator itself no longer issues
 *       any direct `bookings.status` writes.
 *   - `app/api/admin/bookings/[id]/route.ts`
 *       Admin PATCH (validated allowed-set + `buildCompletionCoherencePatch` +
 *       earnings revert path).
 *
 *   Note: `app/api/admin/bookings/route.ts` (POST) is intentionally NOT on
 *   the direct-write allow-list. The monthly branch sets `status` via
 *   `insertBookingRowUnified` (an INSERT, not an UPDATE) using a value
 *   derived from `buildCompletionCoherencePatch`, and the per-booking
 *   Paystack branch is hard-rejected by the
 *   `admin_mark_completed_unsafe_for_payment_link` guard before any write.
 *   M-1 removed a previously-present, statically-unreachable
 *   `bookings.update({ status: "completed" })` block from the per-booking
 *   branch; if the guard ever regresses, admin paid-state mutation should
 *   remain behind the payment finalization command boundary.
 *
 *   Customer-facing safe paths:
 *   - `app/api/dashboard/bookings/[id]/cancel/route.ts`
 *       Customer self-cancel: requires session auth, owner check
 *       (`user_id === userData.user.id`), pre-state in CANCELLABLE
 *       (`pending`/`confirmed`/`assigned`), refuses if `started_at`
 *       is set, and refuses if the booking sits on a closed monthly invoice.
 *
 *   Recovery / reconciliation (catch-block only):
 *   - `lib/booking/upsertBookingFromPaystack.ts`
 *       Finalize-throw recovery write — sets `payment_reconciliation_required`
 *       in the catch block so ops can reconcile manually.
 *
 *   Cron lifecycle paths:
 *   - `app/api/cron/booking-lifecycle/route.ts`
 *       Cron mark-completed pass; delegates to `buildCompletionCoherencePatch`.
 *   - `app/api/cron/expire-pending-payments/route.ts`
 *       Cron expires pending_payment rows (→ payment_expired).
 *
 * --------------------------------------------------------------------------
 * EXEMPT FROM THIS GUARD
 * --------------------------------------------------------------------------
 *   - INSERT statements (initial booking creation) — a row's first status is
 *     determined by the canonical insert helpers, not a status mutation.
 *   - SQL one-time data migrations under `supabase/migrations/` (e.g.
 *     `20260429_marketplace_cleaners.sql` legacy `confirmed → pending` fix,
 *     `20260850_bookings_payment_invariants_dedupe.sql` invariant repair).
 *     These run once and are reviewed at migration authorship.
 *   - SQL migrations that define an approved lifecycle RPC (e.g. the
 *     `assign_team_and_sync_roster` RPC). These are listed explicitly in
 *     {@link ALLOWED_SQL_BOOKINGS_STATUS_MUTATIONS} alongside their rationale.
 *   - `__tests__/` mocks and fixtures.
 *
 * --------------------------------------------------------------------------
 * IF THIS TEST FAILS
 * --------------------------------------------------------------------------
 * 1. PREFER routing the new write through one of the approved helpers above.
 * 2. If a NEW lifecycle / integrity path is genuinely required:
 *    - Add the file path to {@link APPROVED_BOOKINGS_STATUS_WRITERS} below.
 *    - Document the new path in the appropriate helper's JSDoc.
 *    - Add the new transition to `bookingCompletionIntegrity.ts` if it
 *      involves completion semantics.
 * 3. NEVER silence this test by deleting the assertion — that defeats the
 *    audit guarantee.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// __dirname = .../apps/web/lib/booking/__tests__
//   → apps/web                      (up 3)
const WEB_ROOT = path.resolve(__dirname, "..", "..", "..");

/**
 * Files allowed to mutate `bookings.status` directly. Paths are POSIX-style
 * relative to {@link WEB_ROOT} so the test runs identically on Windows / Linux.
 *
 * Every entry MUST correspond to one of the canonical helpers/gateways
 * documented in the file header. Removing an entry here is fine; ADDING one
 * requires an audit-level review.
 */
const APPROVED_BOOKINGS_STATUS_WRITERS: ReadonlySet<string> = new Set([
  // Lifecycle helpers (cleaner-side state transitions + paid-booking auto-assign).
  "lib/cleaner/cleanerLifecycleBookingCommands.ts",
  "lib/booking/assignmentBookingStateCommands.ts",
  /*
   * `lib/dispatch/dispatchOffers.ts` was removed from this allow-list
   * after M-12: the cleaner-accept path now routes through the atomic
   * `accept_dispatch_offer_atomic` SQL RPC (see migration
   * `20260944_m12_accept_dispatch_offer_atomic.sql`) instead of issuing a
   * direct `bookings.update({ status: ... })`. The RPC itself is
   * acknowledged in `ALLOWED_SQL_BOOKINGS_STATUS_MUTATIONS` below
   * (classification: `lifecycle_rpc`).
   */
  "lib/whatsapp/handleCleanerAssignedBookingReply.ts",

  // Integrity / invariant helpers.
  "lib/admin/adminBookingPostCreatePipeline.ts",
  "lib/payout/adminBookingAssignmentEarningsGate.ts",
  "lib/booking/adminEditBookingDetails.ts",
  "lib/recurring/reconcileRecurringPlanOccurrences.ts",
  "lib/recurring/applyRecurringOccurrenceRosterContinuity.ts",
  "lib/salesDocument/createBookingFromSalesQuoteInvoice.ts",

  // Admin manual safe paths.
  // Phase-1D command boundary for admin manual cleaner-offer state. The
  // orchestrator `lib/admin/performAdminAssignToCleaner.ts` (formerly on this
  // allow-list) no longer issues a direct `bookings.status` write — it
  // delegates to `setAdminManualBookingOffered`, narrowing the lifecycle
  // bypass surface to a single auditable command function.
  "lib/admin/adminManualBookingOfferCommand.ts",
  "lib/admin/adminManualDirectAssignCommand.ts",
  "lib/admin/performAdminAssignTeam.ts",
  "lib/admin/performAdminBookingStatusChange.ts",
  // Admin launch-readiness tooling seeds and tears down synthetic bookings.
  // There is no dedicated dev-only exemption list in this audit, so the
  // runtime-owned status writes stay explicitly allow-listed here.
  "lib/launch/launchReadinessChecks.ts",

  // Customer-facing safe path (auth-gated self-cancel).
  "lib/customer/customerBookingModifyHandlers.ts",

  // Recovery / reconciliation (catch-block only).
  "lib/booking/upsertBookingFromPaystack.ts",

  // Cron lifecycle paths.
  "app/api/cron/booking-lifecycle/route.ts",
  "app/api/cron/expire-pending-payments/route.ts",

  // Admin HTTP endpoints (validated allowed-set + completion coherence patch).
  "app/api/admin/bookings/[id]/route.ts",
  // M-1: `app/api/admin/bookings/route.ts` was removed from the allow-list
  // when a dead `bookings.update({ status: "completed" })` block was deleted
  // from its per-booking Paystack branch. The monthly branch still sets
  // `status` at INSERT time (not UPDATE) via `buildCompletionCoherencePatch`,
  // and the per-booking branch is hard-rejected by the
  // `admin_mark_completed_unsafe_for_payment_link` guard. See
  // `app/api/admin/bookings/__tests__/adminMarkCompletedPaystackGuard.test.ts`.

  /*
   * R1 / R0 zero-cash settlement writer.
   * Source: `lib/payments/settleFullyCoveredBooking.ts`
   * Approved write target: `bookings` (fallback path only when RPC missing)
   * Allowed fields: status → "pending", payment_status → "success",
   *   payment_completed_at, billing_type, payment_transaction_id,
   *   plus bookingUncollectedCashColumns() (amount_paid_cents=0).
   * Transaction / RPC boundary: prefers `settle_booking_fully_covered` RPC
   *   (migration 20260714140000); app fallback is ledger-then-update.
   * Callers: booking-v2 confirm / covered-settlement routes (via helper).
   * Tests: `lib/payments/__tests__/settleFullyCoveredBooking.test.ts`
   * Approved because it is the controlled R0/R1 writer that replaced the
   * prior direct status write on `booking-v2/confirm`. Deny-by-default
   * inventory — do not treat this as licence for new payment writers.
   */
  "lib/payments/settleFullyCoveredBooking.ts",

  // Payment-session bootstrap (pending_payment) — documented live offender retained.
  "lib/booking/ensureBookingPaymentSession.ts",

  // Admin area-review fulfillment transitions (cancel / convert to pending_payment).
  "app/api/admin/bookings/[id]/fulfillment/route.ts",
]);

/**
 * Files where `bookings.status` is mutated *indirectly* through a patch
 * variable whose `status` field comes from a same-file helper, function call,
 * or command-boundary parameter (i.e. the static analyzer in this test cannot
 * trace it without a full TS type checker). They are still subject to manual
 * code review and to the allow-list above; this fallback only suppresses the
 * "stale entry" check so we don't false-flag well-known indirect writers.
 *
 * Each entry MUST point to a file that:
 *   1. is also listed in {@link APPROVED_BOOKINGS_STATUS_WRITERS}, AND
 *   2. issues `from("bookings").update(varName)` whose `varName` is built
 *      via a same-file helper that returns/mutates `status`, or accepts a
 *      command-boundary patch parameter pinned by a convergence test.
 */
const APPROVED_INDIRECT_STATUS_WRITERS: ReadonlySet<string> = new Set([
  // Phase-1H assignment command boundary: callers pass status-bearing patches
  // while this module owns the conditional `bookings.update(...)` guards.
  "lib/booking/assignmentBookingStateCommands.ts",
  "lib/cleaner/cleanerLifecycleBookingCommands.ts",
  "lib/admin/adminManualDirectAssignCommand.ts",
  "lib/admin/performAdminAssignTeam.ts",
  "lib/admin/performAdminBookingStatusChange.ts",
]);

/** Directories scanned for `from("bookings").update(...)` call sites. */
const SCAN_ROOTS: readonly string[] = [
  path.join(WEB_ROOT, "lib"),
  path.join(WEB_ROOT, "app", "api"),
];

const SCAN_EXTS: ReadonlySet<string> = new Set([".ts", ".tsx"]);
const SKIP_DIR_NAMES: ReadonlySet<string> = new Set([
  "__tests__",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
]);

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  if (!safeIsDir(root)) return out;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (SKIP_DIR_NAMES.has(name)) continue;
      const full = path.join(dir, name);
      let isDirectory = false;
      try {
        isDirectory = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDirectory) {
        stack.push(full);
        continue;
      }
      const ext = path.extname(name);
      if (!SCAN_EXTS.has(ext)) continue;
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
      if (name.endsWith(".d.ts")) continue;
      out.push(full);
    }
  }
  return out;
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toRelPosix(absPath: string): string {
  const rel = path.relative(WEB_ROOT, absPath);
  return rel.split(path.sep).join("/");
}

type WriteSite = {
  file: string;
  line: number;
  kind: "literal" | "dynamic";
  detail: string;
};

/**
 * Find the matching closing `)` for a `(` that opens at `openIdx + 1`. Tracks
 * nested parens and skips contents inside string / template literals so braces
 * inside strings don't confuse the scan.
 *
 * @returns index of the closing `)` (exclusive of body), or -1 if unbalanced.
 */
function findCallEnd(src: string, openIdx: number): number {
  let depth = 1;
  let i = openIdx + 1;
  let inString: '"' | "'" | "`" | null = null;
  while (i < src.length) {
    const c = src[i];
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inString) {
        inString = null;
      } else if (inString === "`" && c === "$" && src[i + 1] === "{") {
        // Template literal interpolation — track as paren depth.
        depth++;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c as '"' | "'" | "`";
      i++;
      continue;
    }
    if (c === "(" || c === "{") {
      depth++;
    } else if (c === ")" || c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function lineNumberAt(src: string, idx: number): number {
  let n = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === "\n") n++;
  return n;
}

/**
 * Returns true when `body` contains a `status:` key at the object-literal
 * top level (not nested inside a stringified column list, not as part of a
 * suffix like `dispatch_status:` / `payment_status:` /
 * `cleaner_response_status:`).
 */
function bodyHasStatusKey(body: string): boolean {
  // Strip string literals so e.g. `select("status, …")` doesn't trigger.
  const stripped = stripStringLiterals(body);
  return /(?<![A-Za-z0-9_$])status\s*:/.test(stripped);
}

function stripStringLiterals(src: string): string {
  let out = "";
  let i = 0;
  let inString: '"' | "'" | "`" | null = null;
  while (i < src.length) {
    const c = src[i];
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c as '"' | "'" | "`";
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const FROM_BOOKINGS_UPDATE_RE =
  /\.from\s*\(\s*["']bookings["']\s*\)\s*\.update\s*\(/g;

/**
 * Read forward from `start` until a top-level `;` or end of `src`. Tracks
 * paren / brace / bracket depth and skips contents inside string / template
 * literals so semicolons inside strings or expressions don't terminate early.
 */
function readToTopLevelSemicolon(src: string, start: number): string {
  let depth = 0;
  let inString: '"' | "'" | "`" | null = null;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c as '"' | "'" | "`";
      i++;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === ";" && depth === 0) break;
    i++;
  }
  return src.slice(start, i);
}

/**
 * Returns true if `src` declares `varName` (via `const | let | var`) and the
 * RHS of that declaration contains a top-level-ish `status:` key (object
 * literal property). This covers patterns like:
 *   const patch: Record<string, unknown> = { …, status: "pending", … };
 *   const patch = { status: "assigned" };
 */
function declaredVarHasStatusKey(src: string, varName: string): boolean {
  const re = new RegExp(
    `(?:const|let|var)\\s+${escapeRegex(varName)}\\b(?:\\s*:\\s*[^=;]+)?\\s*=\\s*`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const rhs = readToTopLevelSemicolon(src, m.index + m[0].length);
    const stripped = stripStringLiterals(rhs);
    // `(?<![A-Za-z0-9_$?])status\s*:` to skip `dispatch_status:`,
    // `payment_status:`, `cleaner_response_status:`, and `status?:` (optional
    // type annotation).
    if (/(?<![A-Za-z0-9_$?])status\s*:/.test(stripped)) {
      return true;
    }
  }
  return false;
}

/**
 * Find every direct `bookings.status` write site in `src`. A "direct" write is:
 *   - `from("bookings").update({ ... status: ... })` — literal status key.
 *   - `from("bookings").update(<varName>)` where `<varName>.status = …` is
 *     assigned somewhere in the same module, OR `<varName>` is declared with
 *     an object-literal initializer that contains a `status:` key, OR
 *     `Object.assign(<varName>, { status: … })` / `<varName>["status"] = …`
 *     mutates it (covers dynamic patch builders).
 */
function findBookingsStatusWriteSites(filePath: string, src: string): WriteSite[] {
  const out: WriteSite[] = [];
  const rel = toRelPosix(filePath);

  let m: RegExpExecArray | null;
  while ((m = FROM_BOOKINGS_UPDATE_RE.exec(src)) !== null) {
    const openParenIdx = m.index + m[0].length - 1;
    const closeIdx = findCallEnd(src, openParenIdx);
    if (closeIdx < 0) continue;
    const body = src.slice(openParenIdx + 1, closeIdx);
    const trimmed = body.trim();
    const lineNum = lineNumberAt(src, m.index);

    if (trimmed.startsWith("{")) {
      if (bodyHasStatusKey(body)) {
        out.push({ file: rel, line: lineNum, kind: "literal", detail: snippet(body) });
      }
      continue;
    }

    // `.update(varName)` — trace dynamic patch builders.
    const varMatch = trimmed.match(/^([A-Za-z_$][\w$]*)/);
    if (!varMatch) continue;
    const varName = varMatch[1];
    if (!/^[A-Za-z_$][\w$]*$/.test(varName)) continue;

    const stripped = stripStringLiterals(src);
    if (
      new RegExp(
        `(?<![A-Za-z0-9_$])${escapeRegex(varName)}\\.status\\s*=`,
      ).test(stripped)
    ) {
      out.push({
        file: rel,
        line: lineNum,
        kind: "dynamic",
        detail: `update(${varName}) + ${varName}.status = …`,
      });
      continue;
    }
    if (
      new RegExp(
        `Object\\.assign\\s*\\(\\s*${escapeRegex(varName)}\\s*,[\\s\\S]{0,400}?(?<![A-Za-z0-9_$?])status\\s*:`,
      ).test(stripped) ||
      new RegExp(
        `(?<![A-Za-z0-9_$])${escapeRegex(varName)}\\s*\\[\\s*["']status["']\\s*\\]\\s*=`,
      ).test(stripped)
    ) {
      out.push({
        file: rel,
        line: lineNum,
        kind: "dynamic",
        detail: `update(${varName}) + Object.assign / index status = …`,
      });
      continue;
    }
    if (declaredVarHasStatusKey(src, varName)) {
      out.push({
        file: rel,
        line: lineNum,
        kind: "dynamic",
        detail: `update(${varName}) + (const|let|var) ${varName} = { … status: … }`,
      });
      continue;
    }
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snippet(s: string): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  return collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
}

// ---------------------------------------------------------------------------
// Single shared scan — reused by every assertion below.
// ---------------------------------------------------------------------------
const ALL_FILES = SCAN_ROOTS.flatMap((r) => listSourceFiles(r));
const ALL_SITES = ALL_FILES.flatMap((f) =>
  findBookingsStatusWriteSites(f, readFileSync(f, "utf8")),
);
const SITES_BY_FILE = new Map<string, WriteSite[]>();
for (const s of ALL_SITES) {
  const list = SITES_BY_FILE.get(s.file) ?? [];
  list.push(s);
  SITES_BY_FILE.set(s.file, list);
}

describe("H-16 bookings.status direct-write allow-list", () => {
  it("finds at least one write site (sanity: scanner is wired up correctly)", () => {
    expect(ALL_SITES.length).toBeGreaterThan(0);
  });

  it("every direct bookings.status writer is on the approved allow-list", () => {
    const offenders: string[] = [];
    for (const file of SITES_BY_FILE.keys()) {
      if (!APPROVED_BOOKINGS_STATUS_WRITERS.has(file)) {
        const list = SITES_BY_FILE.get(file) ?? [];
        for (const s of list) {
          offenders.push(
            `${s.file}:${s.line} [${s.kind}] ${s.detail.slice(0, 160)}`,
          );
        }
      }
    }
    if (offenders.length > 0) {
      const msg = [
        "",
        "Direct `bookings.status` writes detected outside the H-16 allow-list:",
        ...offenders.map((o) => `  - ${o}`),
        "",
        "Route the write through an approved helper:",
        "  - `cleanerLifecycleBookingCommands` (cleaner-side state transitions)",
        "  - `buildCompletionCoherencePatch` (when transitioning to completed)",
        "  - `ensureBookingAssignedStatusInvariant` (paid + cleaner_ref invariant)",
        "  - `assignCleaner` / `buildAssignmentFieldsForPaidBookingRow` (paid auto-assign)",
        "  - `acceptDispatchOffer` (cleaner accepts dispatch offer)",
        "  - `reassignBookingAfterDecline` (decline-fallback redispatch)",
        "  - `revertAdminBookingAssignmentToBeforeRow` (admin earnings-gate revert)",
        "  - `adminMarkBookingPaid` (admin manual mark-paid)",
        "",
        "If a genuinely new lifecycle path is required, update",
        "APPROVED_BOOKINGS_STATUS_WRITERS in this test file and document the",
        "new helper in `lib/booking/bookingCompletionIntegrity.ts`.",
      ].join("\n");
      expect.fail(msg);
    }
  });

  it("every entry in the allow-list still issues at least one direct write (no stale entries)", () => {
    const stale: string[] = [];
    for (const allowed of APPROVED_BOOKINGS_STATUS_WRITERS) {
      const sites = SITES_BY_FILE.get(allowed);
      if (sites && sites.length > 0) continue;
      // Indirect writers are explicitly acknowledged — exempt from the stale
      // check (see {@link APPROVED_INDIRECT_STATUS_WRITERS} for rationale).
      if (APPROVED_INDIRECT_STATUS_WRITERS.has(allowed)) continue;
      stale.push(allowed);
    }
    if (stale.length > 0) {
      expect.fail(
        `Stale entries in APPROVED_BOOKINGS_STATUS_WRITERS (no longer issue direct bookings.status writes — please remove or move to APPROVED_INDIRECT_STATUS_WRITERS): ${JSON.stringify(stale, null, 2)}`,
      );
    }
  });

  it("every entry in APPROVED_INDIRECT_STATUS_WRITERS is also in APPROVED_BOOKINGS_STATUS_WRITERS and issues a bookings.update", () => {
    for (const indirect of APPROVED_INDIRECT_STATUS_WRITERS) {
      expect(
        APPROVED_BOOKINGS_STATUS_WRITERS.has(indirect),
        `${indirect} must be present in APPROVED_BOOKINGS_STATUS_WRITERS`,
      ).toBe(true);
      const abs = path.join(WEB_ROOT, ...indirect.split("/"));
      const src = readFileSync(abs, "utf8");
      expect(
        /\.from\(\s*["']bookings["']\s*\)\s*\.update\(/.test(src),
        `${indirect} must still call .from("bookings").update(...)`,
      ).toBe(true);
    }
  });

  it("admin PATCH route validates incoming `status` against an explicit allowed-set before writing", () => {
    const file = path.join(
      WEB_ROOT,
      "app",
      "api",
      "admin",
      "bookings",
      "[id]",
      "route.ts",
    );
    const src = readFileSync(file, "utf8");
    // The validation is the gate that prevents admin from setting
    // arbitrary states directly. Keep both the allowed-set and the
    // mismatch error wiring so refactors can't silently widen it.
    expect(src).toMatch(
      /allowed\s*=\s*new\s+Set\s*\(\s*\[\s*["']pending["']\s*,\s*["']assigned["']\s*,\s*["']in_progress["']\s*,\s*["']completed["']\s*,\s*["']cancelled["']\s*,\s*["']failed["']\s*\]\s*\)/,
    );
    expect(src).toMatch(/Invalid status\./);
  });

  it("admin PATCH and POST routes route completion through buildCompletionCoherencePatch", () => {
    const filesNeedingCoherence = [
      path.join(WEB_ROOT, "app", "api", "admin", "bookings", "[id]", "route.ts"),
      path.join(WEB_ROOT, "app", "api", "admin", "bookings", "route.ts"),
      path.join(WEB_ROOT, "app", "api", "cron", "booking-lifecycle", "route.ts"),
      path.join(WEB_ROOT, "lib", "cleaner", "runCleanerBookingLifecycleAction.ts"),
    ];
    for (const f of filesNeedingCoherence) {
      const src = readFileSync(f, "utf8");
      expect(src, `${toRelPosix(f)} must call buildCompletionCoherencePatch`).toMatch(
        /buildCompletionCoherencePatch\s*\(/,
      );
    }
  });

  it("post-create integrity helper enforces `pending + cleaner_ref → assigned`", () => {
    const file = path.join(
      WEB_ROOT,
      "lib",
      "admin",
      "adminBookingPostCreatePipeline.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/ensureBookingAssignedStatusInvariant/);
    // The invariant must check status === pending and a cleaner reference
    // before promoting to "assigned".
    expect(src).toMatch(/st\s*===\s*["']pending["']/);
    expect(src).toMatch(/patch\.status\s*=\s*["']assigned["']/);
  });

  it("recovery / reconciliation writes only fire from a catch block (upsertBookingFromPaystack)", () => {
    const file = path.join(WEB_ROOT, "lib", "booking", "upsertBookingFromPaystack.ts");
    const src = readFileSync(file, "utf8");
    // The reconciliation status must be `payment_reconciliation_required`
    // — never a normal lifecycle state — so the catch block can never
    // race into a happy-path terminal state.
    expect(src).toMatch(/status:\s*"payment_reconciliation_required"/);
    expect(src).toMatch(/catch\s*\(\s*err[^)]*\)\s*{/);
  });

  it("expire-pending-payments cron only transitions pending_payment → payment_expired", () => {
    const file = path.join(
      WEB_ROOT,
      "app",
      "api",
      "cron",
      "expire-pending-payments",
      "route.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(
      /\.update\(\s*\{\s*status:\s*"payment_expired"[\s\S]{0,200}?\}\s*\)\s*\.eq\(\s*"id"\s*,/,
    );
    expect(src).toMatch(/\.eq\(\s*"status"\s*,\s*"pending_payment"\s*\)/);
  });

  it("supabase migrations only contain documented bookings.status mutations", () => {
    const repoRoot = path.resolve(WEB_ROOT, "..", "..");
    const migrationsRoot = path.join(repoRoot, "supabase", "migrations");
    if (!safeIsDir(migrationsRoot)) return;
    const sqlFiles = readdirSync(migrationsRoot)
      .filter((n) => n.endsWith(".sql"))
      .map((n) => path.join(migrationsRoot, n));

    /**
     * Allow-list of SQL migrations that contain a `bookings.status` mutation.
     *
     * Each entry MUST be classified as one of:
     *   - "one_time_data_fix"  — a historical UPDATE that runs once at
     *                            deploy and never again.
     *   - "lifecycle_rpc"      — defines or updates a server-side function
     *                            that mutates `bookings.status` as part of
     *                            the documented lifecycle (e.g. the
     *                            `assign_team_and_sync_roster` RPC).
     */
    /**
     * Post-H01 baseline-era inventory. Historical pre-baseline SQL lives in
     * `supabase/migrations-legacy/` and is subsumed by the production baseline;
     * scanners for this guard only enumerate the active migrations directory.
     */
    const ALLOWED_SQL_BOOKINGS_STATUS_MUTATIONS: ReadonlyMap<
      string,
      "one_time_data_fix" | "lifecycle_rpc"
    > = new Map([
      // Squashed production baseline embeds historical lifecycle / repair
      // UPDATE statements (formerly separate migrations under migrations-legacy).
      ["20260714010000_production_baseline.sql", "one_time_data_fix"],
      // R1: `settle_booking_fully_covered` RPC — controlled zero-cash success
      // settlement; status may move pending_payment → pending when payable=0.
      ["20260714140000_bookings_r0_paid_amount_constraint.sql", "lifecycle_rpc"],
    ]);

    const offenders: string[] = [];
    const stale: string[] = [];

    for (const f of sqlFiles) {
      const base = path.basename(f);
      const sql = readFileSync(f, "utf8");
      const mutates = sqlMutatesBookingsStatus(sql);
      if (mutates && !ALLOWED_SQL_BOOKINGS_STATUS_MUTATIONS.has(base)) {
        offenders.push(base);
      } else if (!mutates && ALLOWED_SQL_BOOKINGS_STATUS_MUTATIONS.has(base)) {
        stale.push(base);
      }
    }

    if (offenders.length > 0) {
      expect.fail(
        [
          "New SQL migrations directly mutate `bookings.status`. Route through",
          "an application helper, or add to ALLOWED_SQL_BOOKINGS_STATUS_MUTATIONS",
          "(with classification: one_time_data_fix | lifecycle_rpc) and reviewer ack:",
          ...offenders.map((o) => `  - supabase/migrations/${o}`),
        ].join("\n"),
      );
    }
    if (stale.length > 0) {
      expect.fail(
        [
          "Stale entries in ALLOWED_SQL_BOOKINGS_STATUS_MUTATIONS (no longer mutate",
          "bookings.status — please remove):",
          ...stale.map((o) => `  - supabase/migrations/${o}`),
        ].join("\n"),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

/**
 * Strip SQL line + block comments so we can pattern-match against statement
 * tokens without comment text confusing the scan.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/--[^\n]*\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * Strip SQL string literals (`'…'`, with `''` doubled-quote escapes). Replaces
 * each literal with a single space so column-name scans don't match string
 * contents (e.g. `lower(coalesce(status, ''))` in a CASE expression).
 */
function stripSqlStringLiterals(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Find every `update [public.]bookings … set <body>` SET-clause `body` and
 * return them. Stops the body at the first top-level (depth 0) `where` /
 * `returning` / `;`. Properly skips parens / brackets / curly braces and
 * single-quoted string literals.
 */
function* iterBookingsUpdateSetBodies(sql: string): Generator<string> {
  // Strip comments first; keep string literals intact for scope tracking.
  const stripped = stripSqlComments(sql);
  // Find every `update [public.]bookings` (optionally followed by an alias /
  // newline) up to the next `set` keyword. We allow newlines between
  // `bookings` and `set` because Postgres pretty-prints SET on its own line.
  // Bound the look-ahead with `[^;]{0,200}?` so we don't drift past a
  // statement boundary on malformed SQL.
  const re = /update\s+(?:public\.)?bookings\b[^;]{0,200}?\bset\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const setStart = m.index + m[0].length;
    let depth = 0;
    let inString = false;
    let i = setStart;
    let endIdx = stripped.length;
    while (i < stripped.length) {
      const c = stripped[i];
      if (inString) {
        if (c === "'" && stripped[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (c === "'") {
          inString = false;
          i++;
          continue;
        }
        i++;
        continue;
      }
      if (c === "'") {
        inString = true;
        i++;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
      else if (depth === 0) {
        if (c === ";") {
          endIdx = i;
          break;
        }
        const prev = i === 0 ? " " : stripped[i - 1] ?? " ";
        if (!/[A-Za-z0-9_]/.test(prev)) {
          const tail = stripped.slice(i, i + 12).toLowerCase();
          if (/^where\b/.test(tail) || /^returning\b/.test(tail)) {
            endIdx = i;
            break;
          }
        }
      }
      i++;
    }
    yield stripped.slice(setStart, endIdx);
  }
}

/**
 * Returns true iff at least one `update bookings` statement in `sql` assigns
 * the `status` column at top level in its SET clause (i.e. not inside a CASE
 * expression, not inside a WHERE clause, and not on a status-named column
 * like `dispatch_status` / `payment_status` / `cleaner_response_status` /
 * `payout_status`).
 */
function sqlMutatesBookingsStatus(sql: string): boolean {
  for (const setBody of iterBookingsUpdateSetBodies(sql)) {
    // Strip string literals before splitting so quoted commas / equals don't
    // confuse segment detection.
    const cleaned = stripSqlStringLiterals(setBody);
    if (setClauseAssignsStatus(cleaned)) return true;
  }
  return false;
}

/**
 * Walk the SET-clause body splitting on top-level commas (depth 0). For each
 * column-assignment segment, check whether the assigned column name is
 * exactly `status` (word-bounded so `dispatch_status`, `payment_status`,
 * `cleaner_response_status`, `payout_status`, etc. do not match).
 */
function setClauseAssignsStatus(setBody: string): boolean {
  let depth = 0;
  let segStart = 0;
  const trimAndCheck = (raw: string) => {
    // Allow leading whitespace and an optional table alias like `b.status`.
    const trimmed = raw.replace(/^\s+/, "");
    return /^(?:[A-Za-z_][\w]*\.)?status\s*=/.test(trimmed) &&
      // ensure the matched alias is "status" not "dispatch_status" etc.
      /^(?:[A-Za-z_][\w]*\.)?status\b\s*=/.test(trimmed);
  };
  for (let i = 0; i < setBody.length; i++) {
    const c = setBody[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      const seg = setBody.slice(segStart, i);
      if (trimAndCheck(seg)) return true;
      segStart = i + 1;
    }
  }
  if (trimAndCheck(setBody.slice(segStart))) return true;
  return false;
}
