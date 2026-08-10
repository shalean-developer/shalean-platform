"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  CLEANER_JOB_ISSUE_REASONS,
  type CleanerJobIssueReasonKey,
} from "@/lib/cleaner/cleanerJobIssueReasons";

export function cleanerIssueBookingIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/cleaner\/jobs\/([^/?#]+)\/?$/);
  if (!match?.[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return null;
  }
}

function newIdempotencyKey(bookingId: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `cleaner-issue:${bookingId}:${suffix}`.slice(0, 128);
}

export function CleanerIssueReportControl() {
  const pathname = usePathname();
  const bookingId = useMemo(() => cleanerIssueBookingIdFromPathname(pathname), [pathname]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CleanerJobIssueReasonKey>("gate_access");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!bookingId) return null;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setError("Please sign in again before reporting this issue.");
        return;
      }
      const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}/issue`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Idempotency-Key": newIdempotencyKey(bookingId),
        },
        body: JSON.stringify({ reason_key: reason, detail: detail.trim() || null }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; reportId?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not submit the issue report.");
        return;
      }
      setSuccess("Issue reported to the operations team.");
      setDetail("");
    } catch {
      setError("Could not submit the issue report. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed bottom-24 right-4 z-40 rounded-full bg-background shadow-lg"
        onClick={() => {
          setOpen(true);
          setError(null);
          setSuccess(null);
        }}
      >
        <AlertTriangle className="mr-2 h-4 w-4" />
        Report issue
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Report job issue">
          <div className="w-full rounded-t-2xl bg-background p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Report a job issue</h2>
                <p className="mt-1 text-sm text-muted-foreground">Operations will receive this against the current booking.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close issue report">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <label className="mt-5 block text-sm font-medium" htmlFor="cleaner-issue-reason">What happened?</label>
            <select
              id="cleaner-issue-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as CleanerJobIssueReasonKey)}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {CLEANER_JOB_ISSUE_REASONS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>

            <label className="mt-4 block text-sm font-medium" htmlFor="cleaner-issue-detail">Extra details (optional)</label>
            <textarea
              id="cleaner-issue-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value.slice(0, 2000))}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm"
              placeholder="Add anything operations should know."
            />

            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            {success ? <p className="mt-3 text-sm font-medium text-emerald-700">{success}</p> : null}

            <div className="mt-5 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" className="flex-1" onClick={() => void submit()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Submit report
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
