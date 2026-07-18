"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Link2,
  Loader2,
  RefreshCw,
  Unplug,
  AlertTriangle,
} from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { emitAdminToast } from "@/lib/admin/toastBus";
import {
  GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES,
  isGoogleBusinessSaveErrorReason,
} from "@/lib/oauth/googleBusinessSaveError";
import {
  FACEBOOK_SAVE_ERROR_MESSAGES,
  isFacebookSaveErrorReason,
} from "@/lib/oauth/metaFacebookSaveError";
import { cn } from "@/lib/utils";
import {
  classifyProviderUxState,
  isProviderPublishReady,
  providerUxStateLabel,
  type ProviderUxState,
} from "@/lib/promotions/marketingUx";
import {
  MarketingEmptyState,
  MarketingSectionSkeleton,
} from "@/components/admin/promotions/MarketingEmptyState";
import { MarketingSubNav } from "@/components/admin/promotions/MarketingSubNav";

type FacebookPageOption = {
  pageId: string;
  pageName: string;
  tasks: string[];
  eligible: boolean;
  ineligibleReason: string | null;
};

type PlatformCard = {
  id: string;
  label: string;
  available: boolean;
  connected: boolean;
  status: string;
  health: string;
  detail: string | null;
  lastSync: string | null;
  lastPublishAt: string | null;
  accountName?: string | null;
  locationName?: string | null;
  locations?: Array<{
    locationId: string;
    title: string;
    accountId: string;
    accountName: string;
    addressLine?: string | null;
  }>;
  pages?: FacebookPageOption[];
  lastError?: string | null;
  oauthConfigured?: boolean;
  envFallbackAllowed?: boolean;
  tokenSource?: string | null;
  lastVerifiedAt?: string | null;
  featureFlag?: string;
  providerEnabled?: boolean;
  publishEnabled?: boolean;
  version?: string;
  characterLimit?: number | null;
  requiresImage?: boolean;
};

type HistoryRow = {
  id: string;
  provider: string;
  campaign_name: string | null;
  status: string;
  response_id: string | null;
  error_message: string | null;
  published_by: string | null;
  created_at: string;
};

type Payload = {
  platforms: PlatformCard[];
  history: HistoryRow[];
  oauth: { googleConfigured: boolean; facebookConfigured?: boolean };
  ops?: { failedLast24h?: number };
};

const ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured:
    "OAuth env vars are missing. For Google set GOOGLE_CLIENT_*; for Facebook set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI.",
  login_config_missing:
    "Login for Business configuration ID is missing. Set FACEBOOK_LOGIN_CONFIG_ID (Facebook) or INSTAGRAM_LOGIN_CONFIG_ID (Instagram) on staging Preview and redeploy. Classic scope-only OAuth is blocked.",
  oauth_denied: "Connection was cancelled or denied.",
  oauth_permissions_error:
    "Meta denied permissions (Login for Business). Confirm the app is Live, the Login configuration includes the required Page/Instagram permissions and assets, then try Connect again.",
  oauth_failed: "OAuth failed. Try again or check provider credentials.",
  invalid_state: "OAuth state validation failed. Please start Connect again.",
  missing_code: "The provider did not return an authorization code.",
  forbidden: "You must be signed in as an admin to connect this account.",
  save_failed: "Connected but saving the account failed.",
  provider_disabled: "This provider is disabled by feature flag.",
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const UX_BADGE_CLASS: Record<ProviderUxState, string> = {
  connected: "bg-emerald-50 text-emerald-800",
  configured: "bg-blue-50 text-blue-800",
  available: "bg-slate-100 text-slate-700",
  pending_location: "bg-amber-50 text-amber-900",
  degraded: "bg-amber-50 text-amber-900",
  expired: "bg-rose-50 text-rose-800",
  error: "bg-rose-50 text-rose-800",
  temporarily_unavailable: "bg-amber-50 text-amber-900",
  disabled: "bg-slate-100 text-slate-500",
  unsupported: "bg-slate-100 text-slate-500",
};

function StatusBadge({ card }: { card: PlatformCard }) {
  const state = classifyProviderUxState(card);
  const label = providerUxStateLabel(state);
  const healthy = state === "connected";
  const warn =
    state === "pending_location" ||
    state === "degraded" ||
    state === "temporarily_unavailable" ||
    state === "expired" ||
    state === "error";

  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        UX_BADGE_CLASS[state],
      )}
    >
      {healthy ? (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      ) : warn ? (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Circle className="h-3.5 w-3.5" aria-hidden />
      )}
      {label}
    </span>
  );
}

function capabilityRibbon(card: PlatformCard): string {
  const state = classifyProviderUxState(card);
  if (isProviderPublishReady(card) || state === "connected") return "Publish ready";
  if (state === "pending_location") return "Location required";
  if (state === "available" || state === "configured") return "Configured / connect";
  if (state === "degraded" || state === "expired" || state === "error") return "Recovery needed";
  if (state === "disabled") return "Flag disabled";
  return "Copy / download only";
}

export function ConnectedAccountsPanel() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "published" | "failed">("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<Payload>("/api/admin/social-accounts");
    if (res.error) {
      emitAdminToast(res.error, "error");
      setData(null);
    } else if (res.data) {
      setData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      // Prefer the sanitized, actionable reason the callback attached over generic copy.
      const reason = searchParams.get("reason");
      const message = isFacebookSaveErrorReason(reason)
        ? FACEBOOK_SAVE_ERROR_MESSAGES[reason]
        : isGoogleBusinessSaveErrorReason(reason)
          ? GOOGLE_BUSINESS_SAVE_ERROR_MESSAGES[reason]
          : (ERROR_MESSAGES[err] ?? `Connection error: ${err}`);
      emitAdminToast(message, "error");
    }
    if (searchParams.get("connected") === "google_business") {
      emitAdminToast(
        searchParams.get("pick") === "1"
          ? "Google connected — select a Business location below."
          : "Google Business Profile connected.",
        "success",
      );
      void load();
    }
    if (searchParams.get("connected") === "facebook") {
      emitAdminToast(
        searchParams.get("pick") === "1"
          ? "Facebook connected — select the Shalean Page below."
          : "Facebook Page connected.",
        "success",
      );
      void load();
    }
  }, [searchParams, load]);

  const google = useMemo(
    () => data?.platforms.find((p) => p.id === "google_business") ?? null,
    [data],
  );

  const filteredHistory = useMemo(() => {
    const rows = data?.history ?? [];
    if (historyFilter === "all") return rows;
    return rows.filter((h) => h.status === historyFilter);
  }, [data?.history, historyFilter]);

  const failedLast24h = data?.ops?.failedLast24h ?? 0;

  async function connectGoogle() {
    setBusy("connect");
    try {
      const res = await adminFetch<{ url: string }>("/api/oauth/google");
      if (res.error || !res.data?.url) {
        emitAdminToast(res.error ?? "Could not start Google OAuth.", "error");
        return;
      }
      window.location.href = res.data.url;
    } finally {
      setBusy(null);
    }
  }

  async function connectFacebook() {
    // Full document navigation (not fetch→Meta) so OAuth state cookies are set on
    // the redirect response. Fetch+assign can lose cookies and surface invalid_state.
    setBusy("fb_connect");
    window.location.assign("/api/oauth/facebook");
  }

  async function selectFacebookPage(pageId: string, confirmReplace = false) {
    setBusy("fb_select_page");
    try {
      const res = await adminFetch<{ ok: boolean }>("/api/admin/social-accounts", {
        method: "POST",
        body: JSON.stringify({
          action: "select_facebook_page",
          pageId,
          confirmReplace,
        }),
      });
      if (res.error) {
        emitAdminToast(res.error, "error");
        return;
      }
      emitAdminToast("Facebook Page selected.", "success");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function disconnectFacebook() {
    if (
      !window.confirm(
        "Disconnect Facebook? Future publishing will be blocked until you reconnect. Publish history is retained. Instagram is not disconnected unless it shares this credential path.",
      )
    ) {
      return;
    }
    setBusy("fb_disconnect");
    try {
      const res = await adminFetch<{ ok: boolean }>("/api/admin/social-accounts", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect_facebook" }),
      });
      if (res.error) {
        emitAdminToast(res.error, "error");
        return;
      }
      emitAdminToast("Facebook disconnected.", "success");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function connectInstagram() {
    setBusy("ig_connect");
    try {
      const res = await adminFetch<{
        ok: boolean;
        displayName?: string | null;
        authorizationUrl?: string | null;
      }>("/api/admin/promotions/publish-instagram", {
        method: "POST",
        body: JSON.stringify({ action: "connect" }),
      });
      if (res.error) {
        emitAdminToast(res.error, "error");
        return;
      }
      if (res.data?.authorizationUrl) {
        // Full document navigation so purpose + state cookies stick (see connectFacebook).
        window.location.assign(res.data.authorizationUrl);
        return;
      }
      emitAdminToast(
        res.data?.displayName
          ? `Instagram connected (${res.data.displayName}).`
          : "Instagram connected.",
        "success",
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function disconnectInstagram() {
    setBusy("ig_disconnect");
    try {
      const res = await adminFetch<{ ok: boolean }>("/api/admin/promotions/publish-instagram", {
        method: "POST",
        body: JSON.stringify({ action: "disconnect" }),
      });
      if (res.error) {
        emitAdminToast(res.error, "error");
        return;
      }
      emitAdminToast("Instagram disconnected.", "success");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: string, extra?: Record<string, string>) {
    setBusy(action);
    try {
      const res = await adminFetch<{ ok: boolean }>("/api/admin/social-accounts", {
        method: "POST",
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.error) {
        emitAdminToast(res.error, "error");
        return;
      }
      emitAdminToast(
        action === "disconnect"
          ? "Google Business disconnected."
          : action === "refresh"
            ? "Locations refreshed."
            : "Location selected.",
        "success",
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Connected Accounts</h1>
        <MarketingSectionSkeleton label="Loading connected accounts…" rows={4} />
      </div>
    );
  }

  if (!loading && !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Connected Accounts</h1>
        <MarketingEmptyState
          stateKey="load_failed"
          actionLabel="Retry"
          onAction={() => void load()}
        />
      </div>
    );
  }

  const platforms = data?.platforms ?? [];
  const publishReadyCount = platforms.filter((p) => isProviderPublishReady(p)).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Connected Accounts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Connect publishing destinations for Growth → Social Posts. Facebook uses Meta OAuth;
          Google Business Profile uses OAuth. Other channels are registered as stubs until adapters
          ship (feature flags <code className="font-mono text-xs">MARKETING_PROVIDER_*</code>).
        </p>
        <div className="mt-3">
          <MarketingSubNav active="connected-accounts" />
        </div>
        {failedLast24h > 0 ? (
          <p
            role="status"
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {failedLast24h} failed publish{failedLast24h === 1 ? "" : "es"} in the last 24 hours.{" "}
            <Link href="/office/marketing/social" className="font-medium underline">
              Retry from Social Posts
            </Link>
            {" · "}
            <Link
              href="/office/marketing/intelligence?focus=dlq"
              className="font-medium underline"
            >
              Inspect DLQ / failures
            </Link>
            .
          </p>
        ) : null}
      </div>

      {publishReadyCount === 0 ? (
        <MarketingEmptyState stateKey="no_connected_providers" />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {platforms.map((p) => (
          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-900 break-words">{p.label}</p>
                <div className="mt-1">
                  <StatusBadge card={p} />
                </div>
              </div>
              <span
                className={cn(
                  "text-xs font-medium uppercase tracking-wide",
                  isProviderPublishReady(p) ? "text-emerald-700" : "text-slate-400",
                )}
              >
                {capabilityRibbon(p)}
              </span>
            </div>

            {p.featureFlag ? (
              <p className="mt-2 text-[11px] text-slate-400">
                Flag <code className="font-mono">{p.featureFlag}</code>
                {p.characterLimit != null ? ` · ${p.characterLimit.toLocaleString()} char limit` : ""}
                {p.requiresImage ? " · image required" : ""}
                {p.version ? ` · v${p.version}` : ""}
              </p>
            ) : null}

            <dl className="mt-4 space-y-1.5 text-sm text-slate-600">
              {p.accountName ? (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-slate-400">Business</dt>
                  <dd>{p.accountName}</dd>
                </div>
              ) : null}
              {p.locationName ? (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-slate-400">Location</dt>
                  <dd>{p.locationName}</dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-400">Last sync</dt>
                <dd>{formatWhen(p.lastSync)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-slate-400">Last publish</dt>
                <dd>{formatWhen(p.lastPublishAt)}</dd>
              </div>
            </dl>

            {p.detail ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {p.detail}
              </p>
            ) : null}

            {p.health === "degraded" || p.status === "error" || p.lastError ? (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                {p.lastError
                  ? p.lastError
                  : p.health === "degraded"
                    ? "Provider health is degraded — refresh or reconnect before publishing."
                    : "Account needs attention before publishing will succeed."}
              </p>
            ) : null}

            {p.id === "google_business" ? (
              <div className="mt-4 space-y-3">
                {(p.locations?.length ?? 0) > 0 &&
                (p.status === "pending_location" || !p.locationName) ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Choose a location
                    </p>
                    <div className="max-h-48 space-y-2 overflow-auto">
                      {p.locations!.map((loc) => (
                        <button
                          key={`${loc.accountId}-${loc.locationId}`}
                          type="button"
                          disabled={busy === "select_location"}
                          aria-label={`Select Google Business location ${loc.title}`}
                          onClick={() =>
                            void runAction("select_location", {
                              locationId: loc.locationId,
                              accountId: loc.accountId,
                            })
                          }
                          className="flex w-full flex-col rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
                        >
                          <span className="font-medium text-slate-900">{loc.title}</span>
                          <span className="text-xs text-slate-500">
                            {loc.accountName}
                            {loc.addressLine ? ` · ${loc.addressLine}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {!p.connected || p.status === "error" ? (
                    <Button
                      size="sm"
                      disabled={busy === "connect" || p.oauthConfigured === false}
                      onClick={() => void connectGoogle()}
                    >
                      {busy === "connect" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {p.connected ? "Reconnect" : "Connect"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={busy === "connect"} onClick={() => void connectGoogle()}>
                      {busy === "connect" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Reconnect
                    </Button>
                  )}
                  {p.connected ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === "refresh"}
                        onClick={() => void runAction("refresh")}
                      >
                        {busy === "refresh" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Refresh
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === "disconnect"}
                        onClick={() => void runAction("disconnect")}
                      >
                        {busy === "disconnect" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unplug className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Disconnect
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : p.id === "facebook" ? (
              <div className="mt-4 space-y-3">
                <div className="space-y-1 text-xs text-slate-500">
                  <p>
                    Connect via Meta OAuth, then select the Shalean Facebook Page. Page tokens are
                    encrypted at rest. Publish from{" "}
                    <Link href="/office/marketing/social" className="text-blue-700 hover:underline">
                      Social Posts
                    </Link>
                    .
                  </p>
                  {p.lastVerifiedAt ? (
                    <p>
                      Last verified: <span className="text-slate-700">{formatWhen(p.lastVerifiedAt)}</span>
                    </p>
                  ) : null}
                  {p.tokenSource ? (
                    <p>
                      Token source:{" "}
                      <code className="font-mono text-slate-700">{p.tokenSource}</code>
                      {p.tokenSource === "environment_fallback"
                        ? " (emergency/local fallback — reconnect via OAuth for normal operation)"
                        : null}
                    </p>
                  ) : null}
                </div>

                {(p.pages?.length ?? 0) > 0 &&
                (p.status === "pending_location" ||
                  p.status === "error" ||
                  (!p.locationName && p.connected)) ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Choose a Facebook Page
                    </p>
                    <div className="max-h-48 space-y-2 overflow-auto">
                      {p.pages!.map((page) => (
                        <button
                          key={page.pageId}
                          type="button"
                          disabled={busy === "fb_select_page" || !page.eligible}
                          aria-label={`Select Facebook Page ${page.pageName}`}
                          title={page.eligible ? undefined : page.ineligibleReason ?? "Not eligible"}
                          onClick={() => {
                            const replacing = Boolean(p.locationName && p.status === "connected");
                            if (
                              replacing &&
                              !window.confirm(
                                `Replace the current Facebook Page connection with “${page.pageName}”?`,
                              )
                            ) {
                              return;
                            }
                            void selectFacebookPage(page.pageId, replacing);
                          }}
                          className={cn(
                            "flex w-full flex-col rounded-xl border px-3 py-2 text-left text-sm",
                            page.eligible
                              ? "border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                              : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-70",
                          )}
                        >
                          <span className="font-medium text-slate-900">{page.pageName}</span>
                          <span className="text-xs text-slate-500">
                            Page {page.pageId.slice(0, 4)}…
                            {!page.eligible && page.ineligibleReason
                              ? ` · ${page.ineligibleReason}`
                              : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {p.providerEnabled !== false ? (
                  <div className="flex flex-wrap gap-2">
                    {!p.connected || p.status === "error" || p.status === "disconnected" ? (
                      <Button
                        size="sm"
                        disabled={busy === "fb_connect" || p.oauthConfigured === false}
                        onClick={() => void connectFacebook()}
                      >
                        {busy === "fb_connect" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {p.status === "error" ? "Reconnect Facebook" : "Connect Facebook"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === "fb_connect"}
                        onClick={() => void connectFacebook()}
                      >
                        {busy === "fb_connect" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {p.health === "healthy" ? "Manage connection" : "Reconnect Facebook"}
                      </Button>
                    )}
                    {p.connected && p.status !== "disconnected" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === "fb_disconnect"}
                        onClick={() => void disconnectFacebook()}
                      >
                        {busy === "fb_disconnect" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unplug className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Disconnect
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Provider flag is off — Connect is unavailable and publish stays blocked.
                  </p>
                )}

                <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    Admin diagnostics (emergency env fallback)
                  </summary>
                  <p className="mt-2">
                    Normal recovery is <strong>Reconnect Facebook</strong> via OAuth. Env tokens (
                    <code className="font-mono">FACEBOOK_PAGE_ID</code> /{" "}
                    <code className="font-mono">FACEBOOK_PAGE_ACCESS_TOKEN</code>) are used only when{" "}
                    <code className="font-mono">FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK</code> is explicitly
                    enabled. Fallback is{" "}
                    {p.envFallbackAllowed ? "currently allowed" : "currently disabled"}.
                  </p>
                </details>
              </div>
            ) : p.id === "instagram" ? (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-500">
                  Instagram uses the <strong>Facebook Login</strong> path: a Professional (Business
                  or Creator) account must be linked to the configured Facebook Page. Personal
                  accounts are rejected. Enable{" "}
                  <code className="font-mono">MARKETING_PROVIDER_INSTAGRAM=1</code> only after
                  staging verification.
                </p>
                {p.providerEnabled ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy === "ig_connect"}
                      onClick={() => void connectInstagram()}
                    >
                      {busy === "ig_connect" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {p.connected ? "Reconnect" : "Connect Instagram"}
                    </Button>
                    {p.connected ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === "ig_disconnect"}
                        onClick={() => void disconnectInstagram()}
                      >
                        {busy === "ig_disconnect" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Unplug className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Disconnect
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Provider flag is off — intentionally disabled, not failed.
                  </p>
                )}
              </div>
            ) : !p.publishEnabled ? (
              <p className="mt-4 text-xs text-slate-500">
                Adapter not publish-enabled. Caption copy and creative download remain available on
                Social Posts; one-click publish stays disabled so this channel is never implied as
                live.
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Publishing history</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recent one-click publishes across platforms. Failed rows can be retried from Social Posts —
          identical content reclaims the ledger after a failure (or after a stuck claim older than 10
          minutes).
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="History filters">
          {(
            [
              ["all", "All"],
              ["published", "Published"],
              ["failed", "Failed"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={historyFilter === id}
              onClick={() => setHistoryFilter(id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                historyFilter === id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {(filteredHistory.length ?? 0) === 0 ? (
          <div className="mt-3">
            <MarketingEmptyState
              stateKey={
                historyFilter === "failed"
                  ? "no_failed_jobs"
                  : historyFilter === "all"
                    ? "no_publish_history"
                    : "no_filter_results"
              }
              title={
                historyFilter === "published"
                  ? "No successful publishes in this filter"
                  : undefined
              }
              description={
                historyFilter === "published"
                  ? "Successful publishes will appear after a one-click post from Social Posts."
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[640px] w-full text-left text-sm">
              <caption className="sr-only">
                Social publish history filtered by {historyFilter}
              </caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Platform</th>
                  <th className="px-4 py-2">Campaign</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">By</th>
                  <th className="px-4 py-2">Response / error</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => {
                  const expanded = expandedHistoryId === h.id;
                  const detail =
                    h.status === "published" ? h.response_id : h.error_message;
                  return (
                    <tr key={h.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                        {formatWhen(h.created_at)}
                      </td>
                      <td className="px-4 py-2">{h.provider === "twitter" ? "x" : h.provider}</td>
                      <td className="px-4 py-2">{h.campaign_name ?? "—"}</td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            h.status === "published"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-rose-50 text-rose-800",
                          )}
                        >
                          {h.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {h.published_by ?? "—"}
                      </td>
                      <td className="max-w-md px-4 py-2 text-xs text-slate-600">
                        {detail ? (
                          <button
                            type="button"
                            className={cn(
                              "text-left hover:text-slate-900",
                              !expanded && "line-clamp-2",
                            )}
                            onClick={() =>
                              setExpandedHistoryId(expanded ? null : h.id)
                            }
                            aria-expanded={expanded}
                          >
                            {detail}
                          </button>
                        ) : (
                          "—"
                        )}
                        {h.status === "failed" ? (
                          <div className="mt-1">
                            <Link
                              href="/office/marketing/social"
                              className="text-blue-700 hover:underline"
                            >
                              Retry on Social Posts
                            </Link>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {google?.oauthConfigured === false ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Google OAuth is not configured on this environment yet.
        </p>
      ) : null}
    </div>
  );
}
