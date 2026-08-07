"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

type AuditEvent = {
  id: string;
  actorUserId: string | null;
  eventType: string;
  targetType: string;
  targetId: string | null;
  permissionCode: string | null;
  reason: string | null;
  oldValue: unknown;
  newValue: unknown;
  metadata: unknown;
  createdAt: string;
};

type AuditPayload = {
  ok?: boolean;
  count?: number;
  events?: AuditEvent[];
  error?: string;
};

function humanize(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(value: string | null): string {
  if (!value) return "—";
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  const body = JSON.stringify(value, null, 2);
  if (!body || body === "{}" || body === "[]") return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">{label}</summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-slate-600">{body}</pre>
    </details>
  );
}

export function OfficeSecurityAuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [days, setDays] = useState("30");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getSupabaseAccessToken();
      if (!token) throw new Error("Your Office session is unavailable. Please sign in again.");
      const since = new Date(Date.now() - Number(days) * 24 * 60 * 60_000).toISOString();
      const response = await fetch(`/api/admin/security/audit-log?limit=250&since=${encodeURIComponent(since)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as AuditPayload | null;
      if (!response.ok) throw new Error(payload?.error || "Unable to load audit log.");
      setEvents(payload?.events ?? []);
      setCount(payload?.count ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load audit log.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) =>
      [event.eventType, event.targetType, event.targetId, event.permissionCode, event.reason, event.actorUserId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [events, query]);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Immutable activity history</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Security & sensitive-action audit log</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Owner-only history of role, permission and other recorded admin actions. Secret-like values are redacted before they reach the browser.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={days} onChange={(event) => setDays(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
          <button type="button" onClick={() => void load()} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Refresh</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search event, target, permission, reason or actor ID"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
        />
        <div className="text-sm text-slate-500">{visible.length} shown · {count} recorded</div>
      </div>

      {loading ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">Loading audit events…</div> : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
      {!loading && !error && visible.length === 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">No matching audit events were recorded in this period.</div> : null}

      <div className="space-y-3">
        {visible.map((event) => (
          <article key={event.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">{humanize(event.eventType)}</span>
                  {event.permissionCode ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{event.permissionCode}</span> : null}
                </div>
                <p className="mt-3 text-sm font-medium text-slate-900">{humanize(event.targetType)} · {shortId(event.targetId)}</p>
                {event.reason ? <p className="mt-1 text-sm text-slate-600">Reason: {event.reason}</p> : null}
                <p className="mt-1 text-xs text-slate-500">Actor: {shortId(event.actorUserId)}</p>
              </div>
              <time className="shrink-0 text-xs text-slate-500" dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
            </div>
            <div className="mt-4 grid gap-2 lg:grid-cols-3">
              <JsonDetails label="Before" value={event.oldValue} />
              <JsonDetails label="After" value={event.newValue} />
              <JsonDetails label="Metadata" value={event.metadata} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
