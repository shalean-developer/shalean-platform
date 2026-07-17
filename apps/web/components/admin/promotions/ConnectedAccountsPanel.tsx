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
import { cn } from "@/lib/utils";

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
  lastError?: string | null;
  oauthConfigured?: boolean;
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
  oauth: { googleConfigured: boolean };
  ops?: { failedLast24h?: number };
};

const ERROR_MESSAGES: Record<string, string> = {
  oauth_not_configured: "Google OAuth env vars are missing. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
  oauth_denied: "Google connection was cancelled or denied.",
  oauth_failed: "Google OAuth failed. Try again or check Google Cloud credentials.",
  invalid_state: "OAuth state validation failed. Please start Connect again.",
  missing_code: "Google did not return an authorization code.",
  forbidden: "You must be signed in as an admin to connect Google Business.",
  save_failed: "Connected to Google but saving the account failed.",
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusBadge({ status, health }: { status: string; health: string }) {
  const connected = status === "connected";
  const pending = status === "pending_location";
  const error = status === "error" || health === "error";
  const degraded = !error && health === "degraded";
  const soon = status === "coming_soon" || status === "disabled";

  const label = soon
    ? status === "disabled"
      ? "Flagged — adapter pending"
      : "Coming soon"
    : error
      ? "Needs attention"
      : degraded
        ? "Token / provider issue"
        : connected
          ? "Connected"
          : pending
            ? "Select location"
            : "Disconnected";

  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        connected && !degraded && !error && "bg-emerald-50 text-emerald-800",
        pending && "bg-amber-50 text-amber-900",
        degraded && "bg-amber-50 text-amber-900",
        error && "bg-rose-50 text-rose-800",
        soon && "bg-slate-100 text-slate-500",
        !connected && !pending && !error && !soon && !degraded && "bg-slate-100 text-slate-600",
      )}
    >
      {connected && !degraded && !error ? (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      ) : soon ? (
        <Circle className="h-3.5 w-3.5" aria-hidden />
      ) : error || pending || degraded ? (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Circle className="h-3.5 w-3.5" aria-hidden />
      )}
      {label}
    </span>
  );
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
      // Prefer the sanitized, actionable reason the callback attached (e.g. the
      // Business Profile API is disabled) over the generic per-error copy.
      const reason = searchParams.get("reason");
      const message = isGoogleBusinessSaveErrorReason(reason)
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
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading connected accounts…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Connected Accounts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Connect publishing destinations for Growth → Social Posts. Facebook uses env Page tokens;
          Google Business Profile uses OAuth. Other channels are registered as stubs until adapters
          ship (feature flags <code className="font-mono text-xs">MARKETING_PROVIDER_*</code>).
        </p>
        <p className="mt-2 text-sm">
          <Link href="/office/marketing/social" className="text-blue-700 hover:underline">
            Back to Social Posts
          </Link>
        </p>
        {failedLast24h > 0 ? (
          <p
            role="status"
            className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {failedLast24h} failed publish{failedLast24h === 1 ? "" : "es"} in the last 24 hours.{" "}
            <Link href="/office/marketing/social" className="font-medium underline">
              Retry from Social Posts
            </Link>
            .
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.platforms ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold text-slate-900">{p.label}</p>
                <div className="mt-1">
                  <StatusBadge status={p.status} health={p.health} />
                </div>
              </div>
              {p.available ? (
                <span className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                  {p.publishEnabled ? "Publish ready" : "Available"}
                </span>
              ) : (
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Copy / download only
                </span>
              )}
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
              <p className="mt-4 text-xs text-slate-500">
                Configure <code className="font-mono">FACEBOOK_PAGE_ID</code> and{" "}
                <code className="font-mono">FACEBOOK_PAGE_ACCESS_TOKEN</code> in server env. See{" "}
                <Link href="/office/marketing/social" className="text-blue-700 hover:underline">
                  Social Posts
                </Link>
                .
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
          <p className="mt-3 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            {historyFilter === "all" ? "No publishes yet." : `No ${historyFilter} rows.`}
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
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
