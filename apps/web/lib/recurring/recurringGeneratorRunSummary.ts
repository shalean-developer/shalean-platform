/** Outcome counters for one `generate-recurring-bookings` cron invocation. */
export type RecurringGeneratorRunCounters = {
  scanned: number;
  generated: number;
  /** Occurrence rows that already existed (duplicate_occurrence). */
  skipped_duplicate: number;
  /** Insert / generation errors for a scheduled occurrence date. */
  failed: number;
  /**
   * Active plans skipped due to missing email, profile, or unsupported billing.
   * Empty generation windows are NOT counted here (healthy no-op).
   */
  skipped_plans: number;
};

export type RecurringGeneratorRunContext = RecurringGeneratorRunCounters & {
  today: string;
  month_start: string;
  month_end: string;
  cursor_eligibility_end: string;
};

export function emptyRecurringGeneratorRunCounters(scanned = 0): RecurringGeneratorRunCounters {
  return {
    scanned,
    generated: 0,
    skipped_duplicate: 0,
    failed: 0,
    skipped_plans: 0,
  };
}

/**
 * Hard failure = occurrence insert failures only.
 * Plan skips (email/profile/billing) are operational data issues — still alerted —
 * but must not mark the cron run as `error` or else `last_success_at` goes stale and
 * the office UI falsely reports the generator “may be down”.
 */
export function recurringGeneratorRunHasHardFailure(counters: RecurringGeneratorRunCounters): boolean {
  return counters.failed > 0;
}

export function recurringGeneratorCronStatus(
  counters: RecurringGeneratorRunCounters,
): "success" | "error" {
  return recurringGeneratorRunHasHardFailure(counters) ? "error" : "success";
}

export function buildRecurringGeneratorRunContext(
  counters: RecurringGeneratorRunCounters,
  window: {
    today: string;
    month_start: string;
    month_end: string;
    cursor_eligibility_end: string;
  },
): RecurringGeneratorRunContext {
  return { ...counters, ...window };
}

export function serializeRecurringGeneratorRunMessage(ctx: RecurringGeneratorRunContext): string {
  return JSON.stringify(ctx);
}

/** Parse `cron_runs.message` JSON from the recurring generator (tolerates legacy `skipped`-only payloads). */
export function parseRecurringGeneratorRunMessage(
  message: string | null | undefined,
): Partial<RecurringGeneratorRunContext> | null {
  const raw = (message ?? "").trim();
  if (!raw.startsWith("{")) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.skipped === true) return null;
    const legacySkipped =
      typeof o.skipped === "number" && typeof o.failed !== "number" && typeof o.skipped_duplicate !== "number";
    return {
      scanned: typeof o.scanned === "number" ? o.scanned : undefined,
      generated: typeof o.generated === "number" ? o.generated : undefined,
      skipped_duplicate:
        legacySkipped && typeof o.skipped === "number"
          ? o.skipped
          : typeof o.skipped_duplicate === "number"
            ? o.skipped_duplicate
            : undefined,
      failed: typeof o.failed === "number" ? o.failed : legacySkipped ? 0 : undefined,
      skipped_plans: typeof o.skipped_plans === "number" ? o.skipped_plans : undefined,
      today: typeof o.today === "string" ? o.today : undefined,
      month_start: typeof o.month_start === "string" ? o.month_start : undefined,
      month_end: typeof o.month_end === "string" ? o.month_end : undefined,
      cursor_eligibility_end:
        typeof o.cursor_eligibility_end === "string" ? o.cursor_eligibility_end : undefined,
    };
  } catch {
    return null;
  }
}

export type RecurringGeneratorCronHealthInput = {
  job_name: string;
  last_success_at: string | null;
  last_run_at: string | null;
  last_run_status: "success" | "error" | null;
  last_run_message: string | null;
  errors_last_24h: number;
};

export type RecurringGeneratorCronWarning = {
  show: boolean;
  message: string;
  severity: "amber" | "red";
};

export function recurringGeneratorCronWarning(
  job: RecurringGeneratorCronHealthInput | undefined,
  formatTs: (iso: string | null) => string,
): RecurringGeneratorCronWarning | null {
  if (!job) {
    return {
      show: true,
      severity: "red",
      message:
        "Recurring generator cron has no recorded runs in cron_runs. Reschedule pg_cron (see scripts/print-repair-generate-recurring-pg-cron.sql.mjs) and ensure CRON_SECRET matches Vercel.",
    };
  }

  const lastRunParsed = parseRecurringGeneratorRunMessage(job.last_run_message);
  const lastRunFailed = (lastRunParsed?.failed ?? 0) > 0;
  const lastRunSkippedPlans = (lastRunParsed?.skipped_plans ?? 0) > 0;

  if (lastRunFailed) {
    return {
      show: true,
      severity: "red",
      message: `Latest generator run reported errors: ${lastRunParsed!.failed} occurrence insert(s) failed. Check system_logs (cron/generate-recurring-bookings) and redeploy if schema/code drift.`,
    };
  }

  const lastSuccess = job.last_success_at ? new Date(job.last_success_at).getTime() : null;
  const staleMs = 30 * 60 * 1000;
  if (!lastSuccess || Date.now() - lastSuccess > staleMs) {
    return {
      show: true,
      severity: "red",
      message: `Recurring generator last succeeded ${formatTs(job.last_success_at)}. Expected every ~10 minutes — check Supabase pg_cron and CRON_SECRET.`,
    };
  }

  if (job.last_run_status === "error") {
    return {
      show: true,
      severity: "amber",
      message: `Latest generator run failed (${formatTs(job.last_run_at)}). Last success ${formatTs(job.last_success_at)}.`,
    };
  }

  if (lastRunSkippedPlans) {
    return {
      show: true,
      severity: "amber",
      message: `Generator is running (last success ${formatTs(job.last_success_at)}) but skipped ${lastRunParsed!.skipped_plans} plan(s) (profile/email/billing). Repair those plans — this is not a cron outage.`,
    };
  }

  // Historical failures are retained for reporting, but a fresh successful latest run means
  // the generator has recovered. Do not keep the current-outage banner visible for 24 hours.
  return null;
}
