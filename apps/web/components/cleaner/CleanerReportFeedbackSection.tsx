"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, MessageSquare, Shield } from "lucide-react";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  subjectsForSubmissionType,
  type CleanerSubmissionType,
} from "@/lib/cleaner/cleanerReportFeedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type DialogMode = CleanerSubmissionType | null;

const COPY: Record<CleanerSubmissionType, { title: string; description: string; privacy: string; submit: string }> = {
  report: {
    title: "Report a concern",
    description:
      "Report harassment, safety issues, or misconduct. Your identity stays hidden from admins — only your message is shared.",
    privacy: "Your name and contact details will not be shown to the admin team.",
    submit: "Submit anonymous report",
  },
  feedback: {
    title: "Send feedback",
    description: "Share suggestions or issues about the app, scheduling, payouts, or support. Your details are included so we can follow up.",
    privacy: "Your name and phone number will be visible to the admin team.",
    submit: "Send feedback",
  },
};

export function CleanerReportFeedbackSection() {
  const [mode, setMode] = useState<DialogMode>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const close = useCallback(() => {
    setMode(null);
    setSubject("");
    setMessage("");
    setSubmitError(null);
  }, []);

  const open = useCallback((next: CleanerSubmissionType) => {
    setMode(next);
    setSubject("");
    setMessage("");
    setSubmitError(null);
    setSuccess(null);
  }, []);

  const submit = useCallback(async () => {
    if (!mode) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) throw new Error("Not signed in.");
      const res = await cleanerAuthenticatedFetch("/api/cleaner/report-feedback", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_type: mode,
          subject: subject.trim() || null,
          message: message.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not submit.");
      setSuccess(mode === "report" ? "Your anonymous report was sent." : "Your feedback was sent.");
      close();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not submit.");
    } finally {
      setSubmitting(false);
    }
  }, [close, message, mode, subject]);

  const subjects = mode ? subjectsForSubmissionType(mode) : [];

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Report &amp; Feedback
          </p>
        </div>
        <button
          type="button"
          onClick={() => open("report")}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-50">
            <Shield className="size-4 text-red-600" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">Report a concern</p>
            <p className="mt-0.5 text-xs text-slate-400">Anonymous — your identity is hidden</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => open("feedback")}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50">
            <MessageSquare className="size-4 text-blue-600" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">Send feedback</p>
            <p className="mt-0.5 text-xs text-slate-400">Your details are shared with admin</p>
          </div>
        </button>
      </div>

      {success ? (
        <p className="rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <Dialog open={mode != null} onOpenChange={(openState) => { if (!openState) close(); }}>
        <DialogContent className="max-w-md">
          {mode ? (
            <>
              <DialogHeader>
                <DialogTitle>{COPY[mode].title}</DialogTitle>
                <p className="text-sm text-slate-500">{COPY[mode].description}</p>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  {mode === "report" ? (
                    <Shield className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-blue-500" aria-hidden />
                  )}
                  <p className="text-xs text-slate-600">{COPY[mode].privacy}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="submission-subject">Topic (optional)</Label>
                  <select
                    id="submission-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-300 focus:outline-none"
                  >
                    <option value="">Select a topic</option>
                    {subjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="submission-message">Message</Label>
                  <Textarea
                    id="submission-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      mode === "report"
                        ? "Describe what happened. Include dates, locations, or behaviour details if you can."
                        : "Tell us what went well or what we can improve."
                    }
                    rows={5}
                    className="resize-none"
                  />
                  <p className="text-xs text-slate-400">{message.trim().length}/8000 (minimum 10)</p>
                </div>

                {submitError ? (
                  <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {submitError}
                  </p>
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={close} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting || message.trim().length < 10}
                  className={cn(mode === "report" && "bg-red-600 hover:bg-red-700")}
                >
                  {submitting ? "Sending…" : COPY[mode].submit}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
