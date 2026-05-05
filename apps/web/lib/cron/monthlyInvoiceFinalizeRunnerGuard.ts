/**
 * Optional guard so only one scheduler (e.g. Vercel vs Supabase pg_net) runs monthly invoice finalize.
 *
 * Set `MONTHLY_INVOICE_FINALIZE_REQUIRE_RUNNER` to a non-empty token (e.g. `vercel`).
 * Matching value must come from either:
 * - Request header `x-monthly-finalize-runner` (recommended for Supabase pg_net), or
 * - Server env `CRON_SOURCE` (set on Vercel alongside other env vars).
 *
 * When unset, finalize routes behave as before (no runner filter).
 */

export type MonthlyInvoiceFinalizeRunnerGuardResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string; context: Record<string, unknown> };

export function assertMonthlyInvoiceFinalizeRunner(request: Request): MonthlyInvoiceFinalizeRunnerGuardResult {
  const required = process.env.MONTHLY_INVOICE_FINALIZE_REQUIRE_RUNNER?.trim();
  if (!required) return { ok: true };

  const headerRunner = request.headers.get("x-monthly-finalize-runner")?.trim() ?? "";
  const envRunner = process.env.CRON_SOURCE?.trim() ?? "";
  const actual = headerRunner || envRunner;

  if (actual !== required) {
    return {
      ok: false,
      skipped: true,
      reason: "monthly_finalize_runner_mismatch",
      context: {
        required,
        has_header_runner: Boolean(headerRunner),
        has_env_cron_source: Boolean(envRunner),
      },
    };
  }

  return { ok: true };
}
