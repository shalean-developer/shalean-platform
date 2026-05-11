/**
 * Pure helpers for classifying the cleaner-dashboard data-load fan-out.
 *
 * The dashboard surface fans /api/cleaner/me + /api/cleaner/offers +
 * /api/cleaner/dashboard out independently. A failure on one MUST NOT hide
 * the other's already-loaded data — that bug previously caused pending
 * dispatch offers to silently disappear when /api/cleaner/dashboard hiccuped
 * (cleaner-side reproduction: cleaner d8a75570-…, offer 8dab7ec1-…).
 *
 * These helpers exist so the contract is unit-testable without spinning up
 * the React hook or jsdom (cleaner vitest config restricts to `node` env).
 */

const DEFAULT_OFFERS_FALLBACK = "Could not load offers.";
const DEFAULT_DASHBOARD_FALLBACK = "Could not load dashboard.";

export type DashboardLoadFanOutErrors = {
  /** Non-null when /api/cleaner/offers rejected. Render as a non-blocking strip. */
  offersError: string | null;
  /** Non-null when /api/cleaner/dashboard rejected. Render as a non-blocking strip. */
  dashboardError: string | null;
};

function messageFromUnknown(err: unknown, fallback: string): string {
  if (err instanceof Error && typeof err.message === "string" && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

/**
 * Classify the result of `Promise.allSettled([offersTask, dashboardTask])`
 * into per-surface error strings. Either side may fail without affecting
 * the other; both sides may succeed (errors null) or both fail.
 */
export function classifyDashboardFanOutSettlements(args: {
  offers: PromiseSettledResult<unknown>;
  dashboard: PromiseSettledResult<unknown>;
}): DashboardLoadFanOutErrors {
  return {
    offersError:
      args.offers.status === "rejected"
        ? messageFromUnknown(args.offers.reason, DEFAULT_OFFERS_FALLBACK)
        : null,
    dashboardError:
      args.dashboard.status === "rejected"
        ? messageFromUnknown(args.dashboard.reason, DEFAULT_DASHBOARD_FALLBACK)
        : null,
  };
}

export type DashboardErrorRenderInputs = {
  /** Identity-level error: no cleaner session / /api/cleaner/me failed. */
  catastrophicError: string | null;
  dashboardError: string | null;
  offersError: string | null;
  /** Whether at least one pending offer is currently in state. */
  hasPendingOffers: boolean;
};

export type DashboardErrorRenderDecision = {
  /** Render the page-level error-only placeholder. ONLY for catastrophic errors. */
  collapseToErrorView: boolean;
  /** Render the inline strip for /api/cleaner/dashboard failures. */
  showDashboardErrorStrip: boolean;
  /** Render the inline strip for /api/cleaner/offers failures. */
  showOffersErrorStrip: boolean;
  /**
   * Even when one or both per-surface fetches failed, a previously-loaded
   * pending offer must remain visible. This flag is the contract assertion
   * tests use to lock that behavior down.
   */
  pendingOffersStillVisible: boolean;
};

export function decideDashboardErrorRender(inputs: DashboardErrorRenderInputs): DashboardErrorRenderDecision {
  const collapseToErrorView = inputs.catastrophicError != null;
  return {
    collapseToErrorView,
    showDashboardErrorStrip: inputs.dashboardError != null && !collapseToErrorView,
    showOffersErrorStrip: inputs.offersError != null && !collapseToErrorView,
    pendingOffersStillVisible: inputs.hasPendingOffers && !collapseToErrorView,
  };
}
