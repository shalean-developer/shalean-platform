"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, RefreshCw, XCircle } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { LaunchCheckResult, LaunchCheckRunResponse } from "@/lib/launch/types";
import { cn } from "@/lib/utils";

type LoadState = "idle" | "loading" | "ready" | "error";

function CheckRow({ item }: { item: LaunchCheckResult }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(item.error || item.details);

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        item.passed
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20"
          : "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20",
      )}
    >
      <div className="flex items-start gap-3">
        {item.passed ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p
                className={cn(
                  "font-semibold",
                  item.passed ? "text-emerald-800 dark:text-emerald-200" : "text-red-800 dark:text-red-200",
                )}
              >
                {item.label}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.id}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                item.passed
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
              )}
            >
              {item.passed ? "Pass" : "Fail"}
            </span>
          </div>
          {item.error ? (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">{item.error}</p>
          ) : null}
          {hasDetails ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {open ? "Hide details" : "Show details"}
            </button>
          ) : null}
          {open && item.details ? (
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-zinc-900/5 p-3 text-xs text-zinc-700 dark:bg-black/30 dark:text-zinc-300">
              {JSON.stringify(item.details, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function OfficeLaunchCheckPage() {
  const [state, setState] = useState<LoadState>("idle");
  const [data, setData] = useState<LaunchCheckRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setState("loading");
    setError(null);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setState("error");
      setError("Sign in as admin to run launch checks.");
      return;
    }

    try {
      const res = await fetch("/api/admin/launch-check", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as Partial<LaunchCheckRunResponse> & {
        error?: string;
      };
      if (!res.ok || json.ok !== true) {
        setState("error");
        setData(null);
        setError(json.error ?? `Launch check failed (${res.status}).`);
        return;
      }
      setData(json as LaunchCheckRunResponse);
      setState("ready");
    } catch (err) {
      setState("error");
      setData(null);
      setError(err instanceof Error ? err.message : "Launch check failed.");
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const summary = data?.summary;

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Launch readiness
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            End-to-end checks for booking persistence, dashboard visibility, payment status, booking
            references, role routing, and mock data. Creates a tagged test booking, verifies all
            surfaces, then cleans up. Unpaid bookings are hidden from the customer dashboard by design
            — checks mark-paid before customer assertions.
          </p>
        </div>
        <button
          type="button"
          disabled={state === "loading"}
          onClick={() => void run()}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <RefreshCw className={state === "loading" ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
          Run checklist
        </button>
      </div>

      {summary ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium",
            summary.failed === 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
          )}
        >
          {summary.passed} / {summary.total} checks passed
          {data?.generatedAt ? (
            <span className="ml-2 font-normal text-zinc-600 dark:text-zinc-400">
              · {new Date(data.generatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      ) : null}

      {state === "error" && error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {state === "ready" && data?.results?.length ? (
        <div className="space-y-3">
          {data.results.map((item) => (
            <CheckRow key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
