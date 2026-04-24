"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type NotificationLogRow = {
  id: string;
  booking_id: string | null;
  channel: string;
  template_key: string;
  recipient: string;
  status: string;
  error: string | null;
  provider: string;
  role: string | null;
  event_type: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function AdminNotificationLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<NotificationLogRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const [draftBookingId, setDraftBookingId] = useState("");
  const [draftStatus, setDraftStatus] = useState<string>("");
  const [draftChannel, setDraftChannel] = useState<string>("");
  const [draftTemplateKey, setDraftTemplateKey] = useState("");
  const [draftRole, setDraftRole] = useState<string>("");
  const [draftEventType, setDraftEventType] = useState("");

  const [appliedBookingId, setAppliedBookingId] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<string>("");
  const [appliedChannel, setAppliedChannel] = useState<string>("");
  const [appliedTemplateKey, setAppliedTemplateKey] = useState("");
  const [appliedRole, setAppliedRole] = useState<string>("");
  const [appliedEventType, setAppliedEventType] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", "60");
    p.set("offset", String(offset));
    if (appliedBookingId.trim()) p.set("booking_id", appliedBookingId.trim());
    if (appliedStatus === "sent" || appliedStatus === "failed") p.set("status", appliedStatus);
    if (appliedChannel === "email" || appliedChannel === "whatsapp" || appliedChannel === "sms") {
      p.set("channel", appliedChannel);
    }
    if (appliedTemplateKey.trim()) p.set("template_key", appliedTemplateKey.trim());
    if (appliedRole === "customer" || appliedRole === "cleaner" || appliedRole === "admin") {
      p.set("role", appliedRole);
    }
    if (appliedEventType.trim()) p.set("event_type", appliedEventType.trim());
    return p.toString();
  }, [
    offset,
    appliedBookingId,
    appliedStatus,
    appliedChannel,
    appliedTemplateKey,
    appliedRole,
    appliedEventType,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Sign in as admin.", "error");
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/admin/notification-logs?${queryString}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = (await res.json()) as {
      logs?: NotificationLogRow[];
      hasMore?: boolean;
      error?: string;
    };
    if (!res.ok) {
      emitAdminToast(j.error ?? "Could not load logs.", "error");
      setLogs([]);
    } else {
      setLogs(j.logs ?? []);
      setHasMore(Boolean(j.hasMore));
    }
    setLoading(false);
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retryOne(logId: string) {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Sign in as admin.", "error");
      return;
    }
    setRetryingId(logId);
    try {
      const res = await fetch("/api/admin/notifications/retry", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        emitAdminToast(j.error ?? "Retry failed.", "error");
      } else {
        emitAdminToast("Retry sent. Refreshing list…", "success");
        await load();
      }
    } finally {
      setRetryingId(null);
    }
  }

  function applyFilters() {
    setAppliedBookingId(draftBookingId.trim());
    setAppliedStatus(draftStatus);
    setAppliedChannel(draftChannel);
    setAppliedTemplateKey(draftTemplateKey.trim());
    setAppliedRole(draftRole);
    setAppliedEventType(draftEventType.trim());
    setOffset(0);
    setExpandedId(null);
  }

  function clearFilters() {
    setDraftBookingId("");
    setDraftStatus("");
    setDraftChannel("");
    setDraftTemplateKey("");
    setDraftRole("");
    setDraftEventType("");
    setAppliedBookingId("");
    setAppliedStatus("");
    setAppliedChannel("");
    setAppliedTemplateKey("");
    setAppliedRole("");
    setAppliedEventType("");
    setOffset(0);
    setExpandedId(null);
  }

  const expanded = logs.find((r) => r.id === expandedId) ?? null;

  return (
    <main className="mx-auto max-w-7xl space-y-8 pb-16">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Notification delivery logs
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Per-send audit for template email, customer WhatsApp/SMS, admin Resend, and legacy confirmation email.
            Rows are written from the app server (service role) after each attempt. Use <strong>role</strong> and{" "}
            <strong>event_type</strong> for analytics; <strong>Retry</strong> re-sends using the stored payload.
          </p>
        </div>
        <Link
          href="/admin/notifications"
          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          ← Monitoring &amp; alerts
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Search by booking, outcome, channel, template key, role, or event type.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="f-booking">Booking ID</Label>
              <Input
                id="f-booking"
                value={draftBookingId}
                onChange={(e) => setDraftBookingId(e.target.value)}
                placeholder="UUID"
              />
            </div>
            <Select label="Status" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
              <option value="">Any</option>
              <option value="sent">sent</option>
              <option value="failed">failed</option>
            </Select>
            <Select label="Channel" value={draftChannel} onChange={(e) => setDraftChannel(e.target.value)}>
              <option value="">Any</option>
              <option value="email">email</option>
              <option value="whatsapp">whatsapp</option>
              <option value="sms">sms</option>
            </Select>
            <div className="space-y-2">
              <Label htmlFor="f-template">Template key</Label>
              <Input
                id="f-template"
                value={draftTemplateKey}
                onChange={(e) => setDraftTemplateKey(e.target.value)}
                placeholder="e.g. booking_confirmed"
              />
            </div>
            <Select label="Role" value={draftRole} onChange={(e) => setDraftRole(e.target.value)}>
              <option value="">Any</option>
              <option value="customer">customer</option>
              <option value="cleaner">cleaner</option>
              <option value="admin">admin</option>
            </Select>
            <div className="space-y-2">
              <Label htmlFor="f-event">Event type</Label>
              <Input
                id="f-event"
                value={draftEventType}
                onChange={(e) => setDraftEventType(e.target.value)}
                placeholder="e.g. payment_confirmed, assigned"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => applyFilters()}>
              Apply
            </Button>
            <Button type="button" variant="secondary" onClick={() => clearFilters()}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log stream</CardTitle>
          <CardDescription>Newest first. Expand a row for payload and error detail.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No rows yet. Run migrations{" "}
              <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">20260516_notification_logs</code>,{" "}
              <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">20260517_notification_logs_role_event_type</code>{" "}
              and trigger a booking or test send.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Booking</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Event</th>
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Recipient</th>
                    <th className="py-2 pr-3">Template</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-zinc-100 align-top dark:border-zinc-800/80"
                    >
                      <td className="py-2 pr-3 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                        {fmtTime(r.created_at)}
                      </td>
                      <td className="max-w-[120px] truncate py-2 pr-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                        {r.booking_id ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs">{r.role ?? "—"}</td>
                      <td className="max-w-[120px] truncate py-2 pr-3 text-xs" title={r.event_type ?? ""}>
                        {r.event_type ?? "—"}
                      </td>
                      <td className="py-2 pr-3">{r.channel}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            r.status === "sent"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400"
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="max-w-[140px] truncate py-2 pr-3 text-xs" title={r.recipient}>
                        {r.recipient}
                      </td>
                      <td className="max-w-[180px] truncate py-2 pr-3 text-xs" title={r.template_key}>
                        {r.template_key}
                      </td>
                      <td className="py-2 pr-3 text-xs">{r.provider}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setExpandedId((id) => (id === r.id ? null : r.id))}
                          >
                            {expandedId === r.id ? "Hide" : "Expand"}
                          </Button>
                          {r.status === "failed" ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 text-xs"
                              disabled={retryingId === r.id}
                              onClick={() => void retryOne(r.id)}
                            >
                              {retryingId === r.id ? "Retry…" : "Retry"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {expanded ? (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-700 dark:bg-zinc-900/40">
              <p className="mb-2 font-medium text-zinc-800 dark:text-zinc-200">Detail — {expanded.id}</p>
              {expanded.error ? (
                <p className="mb-3 text-red-800 dark:text-red-300">
                  <span className="font-medium">Error:</span> {expanded.error}
                </p>
              ) : (
                <p className="mb-3 text-zinc-600 dark:text-zinc-400">No error (success).</p>
              )}
              <p className="mb-1 text-xs font-medium uppercase text-zinc-500">Payload snapshot</p>
              <pre className="max-h-80 overflow-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">
                {JSON.stringify(expanded.payload ?? {}, null, 2)}
              </pre>
            </div>
          ) : null}

          {logs.length > 0 ? (
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={offset === 0 || loading}
                onClick={() => setOffset((o) => Math.max(0, o - 60))}
              >
                Newer
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!hasMore || loading}
                onClick={() => setOffset((o) => o + 60)}
              >
                Older
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
