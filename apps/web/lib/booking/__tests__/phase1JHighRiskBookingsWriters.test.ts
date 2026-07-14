import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Phase 1J: high-risk `bookings` writer inventory.
 *
 * This is intentionally an enforcement/scanner test, not a migration. It
 * classifies the current write surface so future PRs cannot add a new direct
 * writer to high-risk booking-state columns without making the ownership
 * explicit.
 *
 * Runtime TS checks and SQL migration/data-repair checks are separate on
 * purpose. Runtime paths are where command boundaries should converge over
 * time; historical SQL repairs and RPC definitions have their own review lane.
 *
 * Dynamic patch limitation: this scanner can detect object-literal writes,
 * same-file simple patch variables, and the known team-assignment RPC wrapper.
 * It cannot prove the contents of opaque `params.patch` / `row` objects. Those
 * command boundaries are listed separately below and covered by convergence
 * tests that pin their callers.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WEB_ROOT = path.resolve(__dirname, "..", "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");

const HIGH_RISK_BOOKINGS_COLUMNS = [
  "status",
  "dispatch_status",
  "cleaner_id",
  "team_id",
  "is_team_job",
  "payout_owner_cleaner_id",
  "payment_status",
  "payout_status",
  "payout_frozen_cents",
  "display_earnings_cents",
] as const;

type HighRiskBookingsColumn = (typeof HIGH_RISK_BOOKINGS_COLUMNS)[number];

type RuntimeCategory =
  | "phase1_command_boundary"
  | "phase1_rpc_wrapper"
  | "legacy_admin_exception"
  | "legacy_assignment_exception"
  | "legacy_cron_exception"
  | "legacy_customer_exception"
  | "legacy_intake_exception"
  | "legacy_monthly_exception"
  | "legacy_payout_exception"
  | "legacy_payment_exception"
  | "legacy_whatsapp_exception";

type RuntimeClassification = {
  file: string;
  category: RuntimeCategory;
  rationale: string;
};

const PHASE1_COMMAND_BOUNDARY_FILES: readonly string[] = [
  "lib/booking/assignmentBookingStateCommands.ts",
  "lib/booking/teamAssignmentBookingStateCommands.ts",
  "lib/booking/assignTeamAndSyncRoster.ts",
  "lib/cleaner/cleanerLifecycleBookingCommands.ts",
  "lib/admin/adminBookingLifecycleStatusOverrideCommand.ts",
  "lib/admin/adminManualBookingOfferCommand.ts",
  "lib/booking/paymentFinalizationBookingCommands.ts",
  "lib/payout/persistBookingEarningsSnapshotCommand.ts",
];

const CLASSIFIED_RUNTIME_DIRECT_WRITERS: readonly RuntimeClassification[] = [
  {
    file: "lib/booking/assignmentBookingStateCommands.ts",
    category: "phase1_command_boundary",
    rationale: "Phase 1H assignment/ack-escalation booking-state command boundary.",
  },
  {
    file: "lib/admin/adminManualBookingOfferCommand.ts",
    category: "phase1_command_boundary",
    rationale: "Admin manual single-cleaner offer command boundary.",
  },
  {
    file: "lib/booking/assignTeamAndSyncRoster.ts",
    category: "phase1_rpc_wrapper",
    rationale: "Existing assign_team_and_sync_roster RPC wrapper used by Phase 1I command functions.",
  },
  {
    file: "lib/admin/adminBookingPostCreatePipeline.ts",
    category: "legacy_admin_exception",
    rationale: "Post-create normalization/invariant repair path.",
  },
  {
    file: "lib/admin/performAdminRetryDispatchBooking.ts",
    category: "legacy_admin_exception",
    rationale: "Admin dispatch retry path; not migrated in Phase 1J.",
  },
  {
    file: "lib/booking/adminEditBookingDetails.ts",
    category: "legacy_admin_exception",
    rationale: "Broad admin edit path; existing validated legacy writer.",
  },
  {
    file: "app/api/admin/bookings/[id]/route.ts",
    category: "legacy_admin_exception",
    rationale: "Admin PATCH route; existing validated broad legacy writer.",
  },
  {
    file: "lib/admin/adminManualDirectAssignCommand.ts",
    category: "legacy_admin_exception",
    rationale: "Admin direct-assign command updates booking lifecycle + assignment fields together.",
  },
  {
    file: "lib/admin/performAdminAssignTeam.ts",
    category: "legacy_admin_exception",
    rationale: "Admin team-assignment workflow updates booking header state and team payout snapshot fields.",
  },
  {
    file: "lib/launch/launchReadinessChecks.ts",
    category: "legacy_admin_exception",
    rationale: "Admin launch-readiness tooling mutates synthetic booking lifecycle states during checks.",
  },
  {
    file: "lib/dispatch/dispatchOffers.ts",
    category: "legacy_assignment_exception",
    rationale: "Dispatch offer state writer; direct status write moved to SQL RPC, dispatch_status remains here.",
  },
  {
    file: "lib/booking/insertBookingFlowIntake.ts",
    category: "legacy_intake_exception",
    rationale: "Pre-payment booking-flow intake cleanup path.",
  },
  {
    file: "lib/booking/insertPendingPaymentBooking.ts",
    category: "legacy_intake_exception",
    rationale: "Pre-payment booking intake insert path.",
  },
  {
    file: "lib/launch/launchCheckSeed.ts",
    category: "legacy_intake_exception",
    rationale: "Launch-check seed helper inserts synthetic pending-payment bookings for admin verification flows.",
  },
  {
    file: "app/api/booking-v2/confirm/route.ts",
    category: "legacy_intake_exception",
    rationale:
      "Customer booking confirm route inserts the canonical pending-payment booking row. R1 zero-cash settlement status writes moved to settleFullyCoveredBooking (no direct status update here).",
  },
  {
    file: "lib/booking/upsertBookingFromPaystack.ts",
    category: "legacy_payment_exception",
    rationale: "Paystack upsert/reconciliation path; intentionally not migrated in Phase 1J.",
  },
  {
    file: "lib/salesDocument/createBookingFromSalesQuoteInvoice.ts",
    category: "legacy_payment_exception",
    rationale: "Sales-document invoice payment sync advances booking payment/lifecycle state after invoice settlement.",
  },
  {
    file: "lib/monthlyInvoice/settleMonthlyInvoiceChildBooking.ts",
    category: "legacy_monthly_exception",
    rationale: "Monthly invoice child settlement freezes payment/payout state.",
  },
  {
    file: "lib/monthlyInvoice/refundMonthlyInvoicePayment.ts",
    category: "legacy_monthly_exception",
    rationale: "Monthly invoice refund helper rolls child booking payment state back to pending_monthly.",
  },
  {
    file: "lib/payout/adminBookingAssignmentEarningsGate.ts",
    category: "legacy_payout_exception",
    rationale: "Admin earnings-gate revert path.",
  },
  {
    file: "lib/payout/persistCleanerPayout.ts",
    category: "legacy_payout_exception",
    rationale: "Payout engine persists display earnings snapshots.",
  },
  {
    file: "lib/payout/resetBookingCleanerLineEarnings.ts",
    category: "legacy_payout_exception",
    rationale: "Payout repair helper resets display earnings.",
  },
  {
    file: "lib/whatsapp/handleCleanerAssignedBookingReply.ts",
    category: "legacy_whatsapp_exception",
    rationale: "WhatsApp accept/decline lifecycle channel.",
  },
  {
    file: "app/api/cron/booking-lifecycle/route.ts",
    category: "legacy_cron_exception",
    rationale: "Cron lifecycle completion pass.",
  },
  {
    file: "app/api/cron/expire-pending-payments/route.ts",
    category: "legacy_cron_exception",
    rationale: "Cron pending-payment expiry pass.",
  },
  {
    file: "lib/recurring/reconcileRecurringPlanOccurrences.ts",
    category: "legacy_cron_exception",
    rationale: "Recurring occurrence reconciler cancels orphan bookings after payout-safety checks.",
  },
  {
    file: "lib/recurring/applyRecurringOccurrenceRosterContinuity.ts",
    category: "legacy_cron_exception",
    rationale:
      "Recurring roster continuity copies the prior visit multi-cleaner roster onto generated occurrences and sets assigned status.",
  },
  {
    file: "lib/customer/customerBookingModifyHandlers.ts",
    category: "legacy_customer_exception",
    rationale: "Customer self-cancel handler (POST /api/customer/bookings/[id]/cancel).",
  },
  {
    file: "lib/payout/adjustBookingPayoutEarnings.ts",
    category: "legacy_payout_exception",
    rationale: "Admin pre-batch visit earnings adjustment updates payout snapshot columns on a single booking.",
  },
  {
    file: "lib/payout/adjustBookingTeamMemberPayoutEarnings.ts",
    category: "legacy_payout_exception",
    rationale: "Admin team-member visit earnings adjustment updates payout_frozen_cents on rostered bookings.",
  },
  {
    file: "lib/payout/removeCleanerFromVisitPayout.ts",
    category: "legacy_payout_exception",
    rationale: "Admin visit-payout removal clears assignment and payout columns before re-persisting earnings.",
  },
  {
    file: "lib/payout/repairStrippedTeamBookingRoster.ts",
    category: "legacy_payout_exception",
    rationale: "Ops repair restores team roster membership and payout columns after roster sync stripped participants.",
  },
  {
    file: "lib/admin/performAdminBookingStatusChange.ts",
    category: "legacy_admin_exception",
    rationale: "Admin booking status override command with completion earnings gate and revert path.",
  },
  {
    file: "lib/admin/reassignPayoutOwnerBeforeTeamMemberRemove.ts",
    category: "legacy_admin_exception",
    rationale: "Team roster maintenance reassigns payout owner on in-flight bookings before member removal.",
  },
  {
    file: "lib/admin/setTeamLeadCleaner.ts",
    category: "legacy_admin_exception",
    rationale: "Team lead promotion syncs booking header cleaner fields to the appointed lead.",
  },
  {
    file: "lib/payments/settleFullyCoveredBooking.ts",
    category: "legacy_payment_exception",
    rationale:
      "R1 controlled writer: prefers settle_booking_fully_covered RPC; app fallback updates status+payment_status for fully covered zero-cash success. Replaced prior direct status write on booking-v2/confirm.",
  },
  {
    file: "lib/booking/ensureBookingPaymentSession.ts",
    category: "legacy_payment_exception",
    rationale: "Payment-session bootstrap writes pending_payment status when creating/refreshing Paystack links.",
  },
  {
    file: "lib/booking/refundBookingPayment.ts",
    category: "legacy_payment_exception",
    rationale: "Refund path updates payment_status on the booking after gateway refund.",
  },
  {
    file: "app/api/booking-v2/area-review/route.ts",
    category: "legacy_intake_exception",
    rationale: "Area-review intake insert writes initial status/dispatch_status/payment_status for ops review bookings.",
  },
  {
    file: "app/api/admin/bookings/[id]/fulfillment/route.ts",
    category: "legacy_admin_exception",
    rationale: "Admin fulfillment cancel/convert transitions for area-review bookings.",
  },
];

type SqlCategory = "one_time_data_fix" | "runtime_rpc_definition";

type SqlClassification = {
  file: string;
  category: SqlCategory;
  rationale: string;
};

/**
 * Active-tree only (post-H01 squash). Historical classifications that lived under
 * `supabase/migrations-legacy/` are subsumed by the production baseline and are
 * intentionally not listed here — this inventory must track what the active
 * scanner discovers under `supabase/migrations/`.
 */
const CLASSIFIED_SQL_BOOKINGS_HIGH_RISK_MUTATIONS: readonly SqlClassification[] = [
  {
    file: "20260714010000_production_baseline.sql",
    category: "one_time_data_fix",
    rationale:
      "Production baseline embeds historical high-risk bookings UPDATE/RPC bodies from migrations-legacy (status, dispatch, team, payout columns).",
  },
  {
    file: "20260714140000_bookings_r0_paid_amount_constraint.sql",
    category: "runtime_rpc_definition",
    rationale:
      "R1 settle_booking_fully_covered RPC may set status/payment_status for fully covered zero-cash success settlements.",
  },
];

type RuntimeWriteSite = {
  file: string;
  line: number;
  verb: "insert" | "update" | "upsert" | "rpc(assign_team_and_sync_roster)";
  columns: HighRiskBookingsColumn[];
};

const SCAN_ROOTS = [
  path.join(WEB_ROOT, "lib"),
  path.join(WEB_ROOT, "app", "api"),
] as const;

const SKIP_DIR_NAMES = new Set(["__tests__", "node_modules", ".next", ".turbo", "dist", "build"]);

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  if (!safeIsDir(root)) return out;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const name of safeReadDir(dir)) {
      if (SKIP_DIR_NAMES.has(name)) continue;
      const full = path.join(dir, name);
      if (safeIsDir(full)) {
        stack.push(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (/\.test\.(ts|tsx)$/.test(name) || name.endsWith(".d.ts")) continue;
      out.push(full);
    }
  }
  return out;
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toWebRel(absPath: string): string {
  return path.relative(WEB_ROOT, absPath).split(path.sep).join("/");
}

function lineNumberAt(src: string, idx: number): number {
  let n = 1;
  for (let i = 0; i < idx && i < src.length; i++) {
    if (src[i] === "\n") n++;
  }
  return n;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTsStringLiterals(src: string): string {
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
      inString = c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

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
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      i++;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

function readToTopLevelSemicolon(src: string, start: number): string {
  let depth = 0;
  let i = start;
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
      inString = c;
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

function literalMentionsColumn(body: string, col: HighRiskBookingsColumn): boolean {
  return new RegExp(`(?<![A-Za-z0-9_$?])${escapeRegex(col)}\\s*:`).test(stripTsStringLiterals(body));
}

function declaredVarMentionsColumn(src: string, varName: string, col: HighRiskBookingsColumn): boolean {
  const re = new RegExp(`(?:const|let|var)\\s+${escapeRegex(varName)}\\b(?:\\s*:\\s*[^=;]+)?\\s*=\\s*`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const rhs = readToTopLevelSemicolon(src, m.index + m[0].length);
    if (literalMentionsColumn(rhs, col)) return true;
  }
  return false;
}

function dynamicVarMentionsColumn(src: string, varName: string, col: HighRiskBookingsColumn): boolean {
  const stripped = stripTsStringLiterals(src);
  return (
    new RegExp(`(?<![A-Za-z0-9_$])${escapeRegex(varName)}\\.${escapeRegex(col)}\\s*=`).test(stripped) ||
    new RegExp(`(?<![A-Za-z0-9_$])${escapeRegex(varName)}\\s*\\[\\s*["']${escapeRegex(col)}["']\\s*\\]\\s*=`).test(
      stripped,
    ) ||
    new RegExp(
      `Object\\.assign\\s*\\(\\s*${escapeRegex(varName)}\\s*,[\\s\\S]{0,500}?(?<![A-Za-z0-9_$?])${escapeRegex(
        col,
      )}\\s*:`,
    ).test(stripped) ||
    declaredVarMentionsColumn(src, varName, col)
  );
}

function columnsInMutationArg(src: string, body: string): HighRiskBookingsColumn[] {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return HIGH_RISK_BOOKINGS_COLUMNS.filter((col) => literalMentionsColumn(body, col));
  }

  const varMatch = trimmed.match(/^([A-Za-z_$][\w$]*)/);
  if (!varMatch) return [];
  const varName = varMatch[1];
  return HIGH_RISK_BOOKINGS_COLUMNS.filter((col) => dynamicVarMentionsColumn(src, varName, col));
}

function findRuntimeWriteSites(filePath: string, src: string): RuntimeWriteSite[] {
  const sites: RuntimeWriteSite[] = [];
  const rel = toWebRel(filePath);
  const fromRe = /\.from\s*\(\s*["']bookings["']\s*\)/g;
  let from: RegExpExecArray | null;
  while ((from = fromRe.exec(src)) !== null) {
    const chainStart = from.index + from[0].length;
    const nextFrom = src.indexOf(".from(", chainStart);
    const chainEnd = nextFrom < 0 ? src.length : nextFrom;
    const chain = src.slice(chainStart, chainEnd);
    const verbRe = /\.(update|insert|upsert)\s*\(/g;
    let verb: RegExpExecArray | null;
    while ((verb = verbRe.exec(chain)) !== null) {
      const openIdx = chainStart + verb.index + verb[0].length - 1;
      const closeIdx = findCallEnd(src, openIdx);
      if (closeIdx < 0) continue;
      const body = src.slice(openIdx + 1, closeIdx);
      const columns = columnsInMutationArg(src, body);
      if (columns.length === 0) continue;
      sites.push({
        file: rel,
        line: lineNumberAt(src, from.index),
        verb: verb[1] as "insert" | "update" | "upsert",
        columns,
      });
    }
  }

  const rpcRe = /\.rpc\s*\(\s*["']assign_team_and_sync_roster["']/g;
  let rpc: RegExpExecArray | null;
  while ((rpc = rpcRe.exec(src)) !== null) {
    sites.push({
      file: rel,
      line: lineNumberAt(src, rpc.index),
      verb: "rpc(assign_team_and_sync_roster)",
      columns: ["status", "dispatch_status", "cleaner_id", "team_id", "is_team_job", "payout_owner_cleaner_id"],
    });
  }

  return sites;
}

const ALL_RUNTIME_FILES = SCAN_ROOTS.flatMap((root) => listSourceFiles(root));
const ALL_RUNTIME_SITES = ALL_RUNTIME_FILES.flatMap((file) => findRuntimeWriteSites(file, readFileSync(file, "utf8")));
const RUNTIME_SITES_BY_FILE = new Map<string, RuntimeWriteSite[]>();
for (const site of ALL_RUNTIME_SITES) {
  const list = RUNTIME_SITES_BY_FILE.get(site.file) ?? [];
  list.push(site);
  RUNTIME_SITES_BY_FILE.set(site.file, list);
}

describe("Phase 1J high-risk bookings runtime writer inventory", () => {
  it("keeps the high-risk column set explicit", () => {
    expect(HIGH_RISK_BOOKINGS_COLUMNS).toEqual([
      "status",
      "dispatch_status",
      "cleaner_id",
      "team_id",
      "is_team_job",
      "payout_owner_cleaner_id",
      "payment_status",
      "payout_status",
      "payout_frozen_cents",
      "display_earnings_cents",
    ]);
  });

  it("finds at least one runtime writer (scanner sanity)", () => {
    expect(ALL_RUNTIME_SITES.length).toBeGreaterThan(0);
  });

  it("classifies every discovered runtime writer", () => {
    const classified = new Set(CLASSIFIED_RUNTIME_DIRECT_WRITERS.map((entry) => entry.file));
    const offenders = [...RUNTIME_SITES_BY_FILE.entries()]
      .filter(([file]) => !classified.has(file))
      .flatMap(([file, sites]) =>
        sites.map((site) => `${file}:${site.line} ${site.verb} [${site.columns.join(", ")}]`),
      );

    expect(
      offenders,
      [
        "Unclassified high-risk bookings writer(s) detected.",
        "Add the file to CLASSIFIED_RUNTIME_DIRECT_WRITERS with a Phase 1J category/rationale,",
        "or route the write through an existing command boundary.",
      ].join(" "),
    ).toEqual([]);
  });

  it("has no stale runtime writer classifications where static detection is safe", () => {
    const stale = CLASSIFIED_RUNTIME_DIRECT_WRITERS.filter((entry) => !RUNTIME_SITES_BY_FILE.has(entry.file)).map(
      (entry) => `${entry.file} (${entry.category})`,
    );

    expect(
      stale,
      "Remove stale CLASSIFIED_RUNTIME_DIRECT_WRITERS entries or move opaque command boundaries to PHASE1_COMMAND_BOUNDARY_FILES.",
    ).toEqual([]);
  });

  it("keeps Phase 1 command boundaries visible even when they use opaque patch parameters", () => {
    for (const file of PHASE1_COMMAND_BOUNDARY_FILES) {
      const abs = path.join(WEB_ROOT, ...file.split("/"));
      const src = readFileSync(abs, "utf8");
      expect(src.length, `${file} should exist and be non-empty`).toBeGreaterThan(0);
      expect(
        /\.from\s*\(\s*["']bookings["']\s*\)\s*\.(update|insert|upsert)\s*\(|\.rpc\s*\(\s*["']assign_team_and_sync_roster["']/.test(
          src,
        ) ||
          file === "lib/booking/teamAssignmentBookingStateCommands.ts" ||
          (file === "lib/payout/persistBookingEarningsSnapshotCommand.ts" &&
            /persistCleanerPayoutIfUnset\s*\(/.test(src)),
        `${file} should remain an explicit command boundary or delegate to one.`,
      ).toBe(true);
    }
  });

  it("runtime classifications use known Phase 1J categories and do not collide", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const entry of CLASSIFIED_RUNTIME_DIRECT_WRITERS) {
      if (seen.has(entry.file)) dupes.push(entry.file);
      seen.add(entry.file);
      expect(entry.rationale.trim().length, `${entry.file} must document its rationale`).toBeGreaterThan(0);
    }
    expect(dupes, `Duplicate runtime classifications: ${JSON.stringify(dupes, null, 2)}`).toEqual([]);
  });
});

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ");
}

function stripSqlStringLiterals(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
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
    out += sql[i];
    i++;
  }
  return out;
}

function* iterBookingsUpdateSetBodies(sql: string): Generator<string> {
  const stripped = stripSqlComments(sql);
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

function splitTopLevelCommas(setBody: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < setBody.length; i++) {
    const c = setBody[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(setBody.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(setBody.slice(start));
  return parts;
}

function columnsMutatedBySql(sql: string): HighRiskBookingsColumn[] {
  const found = new Set<HighRiskBookingsColumn>();
  for (const body of iterBookingsUpdateSetBodies(sql)) {
    const cleaned = stripSqlStringLiterals(body);
    for (const segment of splitTopLevelCommas(cleaned)) {
      const trimmed = segment.trim();
      for (const col of HIGH_RISK_BOOKINGS_COLUMNS) {
        const re = new RegExp(`^(?:[A-Za-z_][\\w]*\\.)?${escapeRegex(col)}\\b\\s*=`, "i");
        if (re.test(trimmed)) found.add(col);
      }
    }
  }
  return [...found].sort() as HighRiskBookingsColumn[];
}

function discoverSqlHighRiskMutations(): Map<string, HighRiskBookingsColumn[]> {
  const migrationsRoot = path.join(REPO_ROOT, "supabase", "migrations");
  const out = new Map<string, HighRiskBookingsColumn[]>();
  if (!safeIsDir(migrationsRoot)) return out;
  for (const name of readdirSync(migrationsRoot).filter((entry) => entry.endsWith(".sql"))) {
    const columns = columnsMutatedBySql(readFileSync(path.join(migrationsRoot, name), "utf8"));
    if (columns.length > 0) out.set(name, columns);
  }
  return out;
}

describe("Phase 1J high-risk bookings SQL mutation inventory", () => {
  const sqlMutations = discoverSqlHighRiskMutations();

  it("keeps SQL migration/data-repair classification separate from runtime TS checks", () => {
    expect(sqlMutations.size).toBeGreaterThan(0);
  });

  it("classifies every SQL migration that mutates a tracked high-risk bookings column", () => {
    const classified = new Set(CLASSIFIED_SQL_BOOKINGS_HIGH_RISK_MUTATIONS.map((entry) => entry.file));
    const offenders = [...sqlMutations.entries()]
      .filter(([file]) => !classified.has(file))
      .map(([file, columns]) => `${file} [${columns.join(", ")}]`);

    expect(
      offenders,
      [
        "Unclassified SQL bookings mutation(s) detected.",
        "Keep SQL repairs/RPC definitions in CLASSIFIED_SQL_BOOKINGS_HIGH_RISK_MUTATIONS,",
        "not in the runtime TS allow-list.",
      ].join(" "),
    ).toEqual([]);
  });

  it("has no stale SQL classifications where static detection is safe", () => {
    const stale = CLASSIFIED_SQL_BOOKINGS_HIGH_RISK_MUTATIONS.filter((entry) => !sqlMutations.has(entry.file)).map(
      (entry) => `${entry.file} (${entry.category})`,
    );

    expect(stale, "Remove stale CLASSIFIED_SQL_BOOKINGS_HIGH_RISK_MUTATIONS entries.").toEqual([]);
  });

  it("SQL classifications document one-time data fixes separately from runtime RPC definitions", () => {
    const categories = new Set(CLASSIFIED_SQL_BOOKINGS_HIGH_RISK_MUTATIONS.map((entry) => entry.category));
    expect(categories.has("one_time_data_fix")).toBe(true);
    expect(categories.has("runtime_rpc_definition")).toBe(true);
    for (const entry of CLASSIFIED_SQL_BOOKINGS_HIGH_RISK_MUTATIONS) {
      expect(entry.rationale.trim().length, `${entry.file} must document its rationale`).toBeGreaterThan(0);
    }
  });
});
