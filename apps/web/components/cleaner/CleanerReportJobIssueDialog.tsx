"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageCircleWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import {
  buildCleanerJobIssueWhatsAppUrl,
  CLEANER_JOB_ISSUE_REASONS,
  type CleanerJobIssueReasonKey,
  labelForCleanerJobIssueReasonKey,
} from "@/lib/cleaner/cleanerJobIssueReasons";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { cn } from "@/lib/utils";

type Props = {
  bookingId: string;
  /** Shown in WhatsApp prefill only */
  locationHint?: string | null;
  variant?: "outline" | "ghost";
  className?: string;
  /** Minimal text link (e.g. job card footer). */
  linkTrigger?: boolean;
  /** Called after a successful submit (new report, idempotent replay, or 2m duplicate ack). */
  onSuccess?: () => void;
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function CleanerReportJobIssueDialog({
  bookingId,
  locationHint,
  variant = "outline",
  className,
  linkTrigger = false,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CleanerJobIssueReasonKey>("gate_access");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("gate_access");
    setDetail("");
    setErr(null);
    setSaved(false);
    setSaveNote(null);
    idempotencyKeyRef.current = newIdempotencyKey();
  }, [open]);

  const waPrefillUrl = buildCleanerJobIssueWhatsAppUrl({
    bookingId,
    reasonLabel: labelForCleanerJobIssueReasonKey(reason),
    detail: detail.trim() || null,
    location: locationHint ?? null,
  });

  const submit = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setErr("Not signed in.");
        return;
      }
      const idem = idempotencyKeyRef.current ?? newIdempotencyKey();
      idempotencyKeyRef.current = idem;
      const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}/issue`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({
          reason_key: reason,
          detail: detail.trim() || undefined,
          location_hint: locationHint?.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        replayed?: boolean;
        duplicateIgnored?: boolean;
      };
      if (res.status === 429) {
        setErr("Too many reports. Try again in 2 minutes.");
        return;
      }
      if (!res.ok) {
        setErr(json.error ?? "Could not save report.");
        return;
      }
      if (json.replayed) setSaveNote("This submit matched a recent request — nothing new was added.");
      else if (json.duplicateIgnored) setSaveNote("We already logged this issue for you in the last couple of minutes.");
      else setSaveNote(null);
      setSaved(true);
      onSuccess?.();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }, [bookingId, detail, locationHint, onSuccess, reason]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {linkTrigger ? (
          <button
            type="button"
            className={cn(
              "text-xs font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400",
              className,
            )}
          >
            Report issue
          </button>
        ) : (
          <Button
            type="button"
            variant={variant === "ghost" ? "ghost" : "outline"}
            size="sm"
            className={cn(
              variant === "ghost" ? "h-auto p-0 text-xs font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-200" : "",
              className,
            )}
          >
            <MessageCircleWarning className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Report a problem
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{saved ? "Issue reported" : "Report a problem"}</DialogTitle>
          {saved ? (
            <DialogDescription>Your report is on file for this booking.</DialogDescription>
          ) : (
            <DialogDescription>
              Tell ops what is wrong on this job. Your report is saved on the booking so support can follow up.
            </DialogDescription>
          )}
        </DialogHeader>

        {saved ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-base font-semibold text-emerald-900 dark:text-emerald-100">
              <Check className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Issue reported
            </p>
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
              {saveNote ?? "Thanks — we logged this on the booking."}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              If you need an immediate answer, open WhatsApp and our team will pick it up.
            </p>
            <Button className="w-full rounded-xl" asChild>
              <a href={waPrefillUrl} target="_blank" rel="noopener noreferrer">
                Open WhatsApp to ops
              </a>
            </Button>
            <DialogFooter className="sm:justify-start">
              <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="sr-only">Reason</legend>
              <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                {CLEANER_JOB_ISSUE_REASONS.map((r) => (
                  <label
                    key={r.key}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
                      reason === r.key
                        ? "border-blue-400 bg-blue-50/90 dark:border-blue-700 dark:bg-blue-950/40"
                        : "border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-900/50",
                    )}
                  >
                    <input
                      type="radio"
                      name="issue-reason"
                      className="mt-1"
                      disabled={busy}
                      checked={reason === r.key}
                      onChange={() => setReason(r.key)}
                    />
                    <span className="text-zinc-900 dark:text-zinc-50">{r.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`issue-detail-${bookingId}`} className="text-xs font-medium uppercase text-zinc-500">
                Extra detail (optional)
              </label>
              <textarea
                id={`issue-detail-${bookingId}`}
                value={detail}
                onChange={(e) => setDetail(e.target.value.slice(0, 500))}
                rows={3}
                disabled={busy}
                className="mt-1 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                placeholder="Anything else we should know?"
              />
            </div>
            {err ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-100">
                {err}
              </p>
            ) : null}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              You can also message ops directly (nothing saved until you submit above):{" "}
              <a
                className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                href={waPrefillUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            </p>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button type="button" className="w-full rounded-xl" disabled={busy} onClick={() => void submit()}>
                {busy ? "Saving…" : "Submit report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
