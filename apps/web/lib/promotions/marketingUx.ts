/**
 * MKT-001F — shared marketing admin UX helpers (pure, testable).
 * Does not change publish/queue/provider architecture.
 */

export type ProviderUxState =
  | "connected"
  | "configured"
  | "available"
  | "pending_location"
  | "degraded"
  | "expired"
  | "error"
  | "temporarily_unavailable"
  | "disabled"
  | "unsupported";

export type ProviderCardLike = {
  id: string;
  available?: boolean;
  connected?: boolean;
  status?: string;
  health?: string;
  publishEnabled?: boolean;
  providerEnabled?: boolean;
  oauthConfigured?: boolean;
  detail?: string | null;
  lastError?: string | null;
};

export type EmptyStateKey =
  | "no_connected_providers"
  | "no_campaigns"
  | "no_draft_posts"
  | "no_publish_history"
  | "no_failed_jobs"
  | "no_dlq_jobs"
  | "no_alerts"
  | "no_intelligence_findings"
  | "no_filter_results"
  | "provider_unavailable"
  | "insufficient_analytics"
  | "no_templates"
  | "no_assets"
  | "load_failed";

export type EmptyStateCopy = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

const EMPTY_STATE_COPY: Record<EmptyStateKey, EmptyStateCopy> = {
  no_connected_providers: {
    title: "No providers ready to publish",
    description:
      "Connect Facebook via Meta OAuth or Google Business Profile so Social Posts can publish. Stub channels stay copy/download-only until their adapters ship.",
    actionLabel: "Open Connected Accounts",
    actionHref: "/office/marketing/connected-accounts",
  },
  no_campaigns: {
    title: "No campaigns yet",
    description:
      "Create a campaign or launch a template to generate social, email, and landing content. Drafts are saved until you activate them.",
    actionLabel: "Browse templates",
    actionHref: "/office/marketing/templates",
  },
  no_draft_posts: {
    title: "No social posts to review",
    description:
      "Generate content from a campaign first. Facebook and Google Business posts appear here when ready; other channels support copy and download only.",
    actionLabel: "Go to Campaigns",
    actionHref: "/office/marketing/campaigns",
  },
  no_publish_history: {
    title: "No publishes in history yet",
    description:
      "Successful and failed one-click publishes appear here after you post from Social Posts. Use filters to focus on failures when troubleshooting.",
    actionLabel: "Open Social Posts",
    actionHref: "/office/marketing/social",
  },
  no_failed_jobs: {
    title: "No failed publishes in this view",
    description:
      "Nothing failed for the selected filter. If operators reported an issue, widen the filter to All or check Platform Intelligence for queue/DLQ rows.",
    actionLabel: "Open Platform Intelligence",
    actionHref: "/office/marketing/intelligence",
  },
  no_dlq_jobs: {
    title: "Dead-letter queue is empty",
    description:
      "No jobs are waiting for replay in this window. If publishes are stalling, check retry backlog and worker status above.",
  },
  no_alerts: {
    title: "No operational alerts",
    description:
      "Publishing health looks stable for this window and filter. Saved views keep your usual time range and provider focus.",
  },
  no_intelligence_findings: {
    title: "No recommendations right now",
    description:
      "Queue depth, provider health, and retry rates are within configured thresholds for this window.",
  },
  no_filter_results: {
    title: "No results for these filters",
    description:
      "Try clearing the provider or campaign filter, or widen the time range. Saved views can be deleted if they no longer match active traffic.",
  },
  provider_unavailable: {
    title: "Provider unavailable for publishing",
    description:
      "This channel is registered but not publish-enabled (feature flag off, stub adapter, or connection missing). Use copy/download, or reconnect if the provider supports OAuth.",
    actionLabel: "Connected Accounts",
    actionHref: "/office/marketing/connected-accounts",
  },
  insufficient_analytics: {
    title: "Not enough data for this period",
    description:
      "Rates and percentages stay blank until there are enough attempts. Widen the time range or remove filters rather than treating 0% as a real failure rate.",
  },
  no_templates: {
    title: "No campaign templates available",
    description:
      "Templates are loaded from the campaign-templates API. Refresh the page or confirm admin access if this list stays empty.",
  },
  no_assets: {
    title: "No campaign assets yet",
    description:
      "Generate a campaign to create social image templates and QR codes. You can replace generated images with custom uploads later.",
    actionLabel: "Go to Campaigns",
    actionHref: "/office/marketing/campaigns",
  },
  load_failed: {
    title: "Could not load this section",
    description:
      "Confirm you are signed in as an admin and that marketing tables exist on this environment. Retry once; if it persists, note any correlation ID from a toast.",
  },
};

export function getEmptyStateCopy(key: EmptyStateKey): EmptyStateCopy {
  return EMPTY_STATE_COPY[key];
}

/**
 * Map API platform card fields to a single operator-facing UX state.
 * Never implies publish-ready when the adapter/flag is disabled.
 */
export function classifyProviderUxState(card: ProviderCardLike): ProviderUxState {
  const status = (card.status ?? "").toLowerCase();
  const health = (card.health ?? "").toLowerCase();
  const publishEnabled = Boolean(card.publishEnabled);
  const available = Boolean(card.available);

  if (status === "coming_soon") return "unsupported";
  if (status === "disabled" || card.providerEnabled === false) return "disabled";
  if (!available && !publishEnabled) return "unsupported";

  if (status === "pending_location") return "pending_location";
  if (status === "error" || health === "error") return "error";
  if (health === "degraded") return "degraded";
  if (
    status === "expired" ||
    /expired|token.*expir/i.test(card.detail ?? "") ||
    /expired|token.*expir/i.test(card.lastError ?? "")
  ) {
    return "expired";
  }
  if (health === "unknown" && card.connected) return "temporarily_unavailable";

  if (card.connected && publishEnabled && (status === "connected" || status === "")) {
    return "connected";
  }
  if (card.connected && !publishEnabled) return "configured";
  if (available && publishEnabled && !card.connected) return "available";
  if (available) return "configured";
  return "unsupported";
}

export function providerUxStateLabel(state: ProviderUxState): string {
  switch (state) {
    case "connected":
      return "Connected";
    case "configured":
      return "Configured";
    case "available":
      return "Available";
    case "pending_location":
      return "Select location";
    case "degraded":
      return "Degraded — reconnect recommended";
    case "expired":
      return "Expired — reconnect required";
    case "error":
      return "Needs attention";
    case "temporarily_unavailable":
      return "Temporarily unavailable";
    case "disabled":
      return "Disabled (feature flag)";
    case "unsupported":
      return "Coming soon";
    default:
      return "Unknown";
  }
}

/** True when UI may offer a one-click publish action for this provider. */
export function isProviderPublishReady(card: ProviderCardLike): boolean {
  const state = classifyProviderUxState(card);
  return (
    Boolean(card.publishEnabled) &&
    Boolean(card.available) &&
    Boolean(card.connected) &&
    state === "connected"
  );
}

/**
 * Format a ratio as a percentage, or em-dash when sample is insufficient.
 * Avoids showing 0% when there were zero attempts.
 */
export function formatSafePercent(
  rate: number | null | undefined,
  sampleSize?: number | null,
): string {
  if (sampleSize != null && sampleSize <= 0) return "—";
  if (rate == null || Number.isNaN(rate)) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

export function formatSafeRoi(roi: number | null | undefined, views?: number | null): string {
  if (views != null && views <= 0) return "—";
  if (roi == null || Number.isNaN(roi)) return "—";
  return `${(roi * 100).toFixed(0)}%`;
}

export type PublishGuardInput = {
  busy: boolean;
  configured: boolean;
  registryPublishable?: boolean;
  overLimit: boolean;
  caption: string;
};

/** Whether the publish control should be enabled (and duplicate clicks blocked). */
export function canInvokePublish(input: PublishGuardInput): boolean {
  if (input.busy) return false;
  if (!input.configured) return false;
  if (input.registryPublishable === false) return false;
  if (input.overLimit) return false;
  if (!input.caption.trim()) return false;
  return true;
}

export function isCampaignFormDirty(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>,
): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const key of keys) {
    if (current[key] !== baseline[key]) return true;
  }
  return false;
}

export type RegistryProviderSnapshot = {
  key: string;
  displayName: string;
  enabled: boolean;
  publishable: boolean;
  capabilities?: {
    publishEnabled?: boolean;
    characterLimit?: number | null;
    requiresImage?: boolean;
  };
};

export function registryAllowsPublish(
  providers: RegistryProviderSnapshot[] | null | undefined,
  key: string,
): boolean {
  if (!providers?.length) return true; // fail-open to diagnostics-only mode
  const entry = providers.find((p) => p.key === key);
  if (!entry) return false;
  return Boolean(entry.enabled && entry.publishable);
}

export const MARKETING_HUB_NAV = [
  { href: "campaigns", label: "Campaigns", match: "campaigns" },
  { href: "social", label: "Social", match: "social" },
  { href: "email", label: "Email", match: "email" },
  { href: "landing-pages", label: "Landing", match: "landing" },
  { href: "analytics", label: "Analytics", match: "analytics" },
  { href: "templates", label: "Templates", match: "templates" },
  { href: "assets", label: "Assets", match: "assets" },
  { href: "connected-accounts", label: "Accounts", match: "connected-accounts" },
  { href: "intelligence", label: "Intelligence", match: "intelligence" },
] as const;
