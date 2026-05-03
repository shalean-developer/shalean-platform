"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  CLEANER_WEEKDAY_CODES,
  CLEANER_WEEKDAY_LABELS,
  type CleanerWeekdayCode,
} from "@/lib/cleaner/availabilityWeekdays";
import { CLEANER_PREFERRED_AREA_NAMES } from "@/lib/cleaner/cleanerPreferredAreaOptions";
import { LocationMultiSelect } from "./LocationMultiSelect";
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

type WorkSettingsJson = {
  error?: string;
  assigned_area?: string | null;
  working_days?: string[];
  last_request?: { id: string; status: string; created_at: string } | null;
};

function lastRequestLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "pending") return "Pending approval";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return status;
}

type CleanerWorkSettingsCardProps = {
  /** Reserved for layout tweaks when nested in {@link CleanerHeroStack}. */
  embedded?: boolean;
  /** When incremented (e.g. Supabase Realtime), refetches work settings from the API. */
  realtimeRefreshKey?: number;
};

const PANEL_CLASS =
  "w-full space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-black/[0.04] dark:bg-card/95 dark:ring-white/[0.06]";

export function CleanerWorkSettingsCard({ embedded: _embedded = false, realtimeRefreshKey }: CleanerWorkSettingsCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignedArea, setAssignedArea] = useState<string | null>(null);
  const [workingDays, setWorkingDays] = useState<CleanerWeekdayCode[]>([...CLEANER_WEEKDAY_CODES]);
  const [lastRequest, setLastRequest] = useState<WorkSettingsJson["last_request"]>(null);

  const [open, setOpen] = useState(false);
  const [prefLocations, setPrefLocations] = useState<string[]>([]);
  const [prefDays, setPrefDays] = useState<Set<CleanerWeekdayCode>>(() => new Set(CLEANER_WEEKDAY_CODES));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        if (!silent) setError("Not signed in.");
        return;
      }
      const res = await cleanerAuthenticatedFetch("/api/cleaner/work-settings", { headers });
      const j = (await res.json().catch(() => ({}))) as WorkSettingsJson;
      if (!res.ok) throw new Error(j.error ?? "Could not load work settings.");
      setAssignedArea(typeof j.assigned_area === "string" && j.assigned_area.trim() ? j.assigned_area.trim() : null);
      const wd = Array.isArray(j.working_days) ? j.working_days : [];
      const normalized = CLEANER_WEEKDAY_CODES.filter((d) => wd.includes(d));
      setWorkingDays(normalized as CleanerWeekdayCode[]);
      setLastRequest(j.last_request ?? null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Could not load work settings.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial work settings fetch on mount
    void load();
  }, [load]);

  useEffect(() => {
    if (realtimeRefreshKey == null || realtimeRefreshKey === 0) return;
    void load({ silent: true });
  }, [realtimeRefreshKey, load]);

  const refetchDebounceMs = useRef(0);
  useEffect(() => {
    const run = () => {
      const now = Date.now();
      if (now - refetchDebounceMs.current < 400) return;
      refetchDebounceMs.current = now;
      void load({ silent: true });
    };
    const onFocus = () => run();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const openModal = useCallback(() => {
    setPrefLocations([]);
    setPrefDays(new Set(workingDays));
    setNote("");
    setSubmitError(null);
    setOpen(true);
  }, [workingDays]);

  const togglePrefDay = (d: CleanerWeekdayCode) => {
    setPrefDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const submitRequest = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const ordered = CLEANER_WEEKDAY_CODES.filter((d) => prefDays.has(d));
      if (ordered.length === 0) {
        setSubmitError("Pick at least one working day.");
        return;
      }
      if (prefLocations.length === 0) {
        setSubmitError("Select at least one preferred area.");
        return;
      }
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setSubmitError("Not signed in.");
        return;
      }
      const res = await cleanerAuthenticatedFetch("/api/cleaner/work-settings/request", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_locations: prefLocations,
          requested_days: ordered,
          note: note.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Could not submit request.");
      setOpen(false);
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const lastRequestCaption = useMemo(() => {
    if (!lastRequest) return null;
    return `Last request: ${lastRequestLabel(lastRequest.status)}`;
  }, [lastRequest]);

  const hasPendingRequest = lastRequest?.status?.toLowerCase() === "pending";

  if (loading) {
    return (
      <div className={PANEL_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Work settings</h3>
        </div>
        <p className="text-xs text-muted-foreground">Loading your area and schedule…</p>
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={PANEL_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Work settings</h3>
        </div>
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" className="w-full rounded-xl sm:w-auto" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className={PANEL_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Work settings</h3>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Assigned area</p>
            <p className="mt-1 text-sm font-medium text-foreground">{assignedArea ?? "Not assigned"}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Working days</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {CLEANER_WEEKDAY_CODES.map((code) => {
                const isActive = workingDays.includes(code);
                return (
                  <span
                    key={code}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium",
                      isActive
                        ? "bg-green-600 text-white dark:bg-emerald-600"
                        : "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400",
                    )}
                  >
                    {CLEANER_WEEKDAY_LABELS[code]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-3">
          <button
            type="button"
            disabled={hasPendingRequest}
            className={cn(
              "text-left text-sm font-medium underline-offset-4",
              hasPendingRequest
                ? "cursor-not-allowed text-muted-foreground no-underline"
                : "text-primary hover:underline",
            )}
            onClick={() => {
              if (hasPendingRequest) return;
              openModal();
            }}
          >
            Request changes
          </button>
          {hasPendingRequest ? (
            <p className="text-xs text-muted-foreground">You already have a request awaiting approval.</p>
          ) : lastRequestCaption ? (
            <p className="text-xs text-muted-foreground">{lastRequestCaption}</p>
          ) : null}
          <p className="text-xs text-muted-foreground/90">Managed by Shalean — request changes if needed.</p>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md overflow-visible rounded-2xl">
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="pref-areas">Preferred work areas</Label>
              <LocationMultiSelect
                id="pref-areas"
                value={prefLocations}
                onChange={setPrefLocations}
                options={CLEANER_PREFERRED_AREA_NAMES}
                max={3}
                disabled={submitting}
                helperText="Select up to 3 areas near you from the list."
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Preferred working days</p>
              <div className="flex flex-wrap gap-1.5">
                {CLEANER_WEEKDAY_CODES.map((d) => {
                  const selected = prefDays.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => togglePrefDay(d)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "border-green-600 bg-green-600 text-white hover:bg-green-700 dark:border-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                          : "border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
                      )}
                    >
                      {CLEANER_WEEKDAY_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pref-note">Optional note</Label>
              <Textarea
                id="pref-note"
                className="min-h-[88px] rounded-xl"
                placeholder="Anything ops should know…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" className="rounded-xl" disabled={submitting} onClick={() => void submitRequest()}>
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
