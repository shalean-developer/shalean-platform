"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { BOOKING_ROSTER_LOCKED_HINT } from "@/lib/admin/bookingRosterLockedMessage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cleanerWorkloadStatusLabel,
  replacementAvailabilityDisplayLabel,
} from "@/lib/cleaner/cleanerWorkloadStatusDisplay";
import { cn } from "@/lib/utils";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export type EmergencyRosterCleanerRow = {
  id: string;
  cleaner_id: string;
  role: string;
  assigned_at?: string;
  payout_weight?: number;
  lead_bonus_cents?: number;
  source?: string | null;
  cleaner_name?: string | null;
};

type CleanerHit = {
  id: string;
  full_name: string | null;
  phone?: string | null;
  status?: string | null;
  is_available?: boolean | null;
  rating?: number | null;
  jobs_completed?: number | null;
  location?: string | null;
};

type ReplacementSuggestion = {
  cleanerId: string;
  name: string;
  rating: number | null;
  totalJobs: number;
  distanceKm: number | null;
  availability: string;
  score: number;
};

type DraftContext = {
  status?: string | null;
  availability?: string;
  distanceKm?: number | null;
  rating?: number | null;
  jobs?: number;
};

type DraftMember = { cleanerId: string; label: string; context?: DraftContext };

function contextSubtitle(m: DraftMember): string | null {
  const c = m.context;
  if (!c) return null;
  const parts: string[] = [];
  const avail = (c.availability ?? "").trim();
  if (avail) parts.push(avail);
  if (c.distanceKm != null && Number.isFinite(c.distanceKm)) {
    parts.push(`${c.distanceKm} km from job`);
  }
  if (c.rating != null && Number.isFinite(c.rating)) {
    parts.push(`★ ${c.rating.toFixed(1)}`);
  }
  if (c.jobs != null && c.jobs > 0) {
    parts.push(`${c.jobs} jobs`);
  }
  const st = (c.status ?? "").trim().toLowerCase();
  if (st && !avail.toLowerCase().includes(st)) {
    parts.push(st);
  }
  return parts.length ? parts.join(" · ") : null;
}

function reliabilityHint(m: DraftMember): string | null {
  const c = m.context;
  if (!c?.rating || c.rating < 4.5) return null;
  if ((c.jobs ?? 0) < 20) return null;
  return "Strong track record";
}

function contextFromHit(hit: CleanerHit): DraftContext | undefined {
  const st = (hit.status ?? "").trim().toLowerCase();
  let availability: string | undefined;
  if (hit.is_available === true || st === "available") availability = "Available";
  else if (st === "busy" || st === "offline") {
    availability = cleanerWorkloadStatusLabel(st, hit.is_available);
  } else if (st) availability = st.charAt(0).toUpperCase() + st.slice(1);

  const has =
    availability ||
    hit.rating != null ||
    hit.jobs_completed != null ||
    (hit.status ?? "").trim();
  if (!has) return undefined;
  return {
    status: hit.status,
    availability,
    rating: typeof hit.rating === "number" ? hit.rating : undefined,
    jobs: typeof hit.jobs_completed === "number" ? hit.jobs_completed : undefined,
  };
}

function contextFromSuggestion(s: ReplacementSuggestion): DraftContext {
  return {
    availability: replacementAvailabilityDisplayLabel(s.availability),
    distanceKm: s.distanceKm,
    rating: s.rating ?? undefined,
    jobs: s.totalJobs,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  /** When true, roster cannot be edited (earnings finalized). */
  locked: boolean;
  initialRoster: EmergencyRosterCleanerRow[];
  onSaved: (roster: EmergencyRosterCleanerRow[]) => void;
};

export function EmergencyRosterReassignModal({
  open,
  onOpenChange,
  bookingId,
  locked,
  initialRoster,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<DraftMember[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<CleanerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [replaceForId, setReplaceForId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ReplacementSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [addExpanded, setAddExpanded] = useState(true);
  /** Team Lead when the modal last synced from `initialRoster` (for unsaved-lead detection). */
  const [baselineLeadId, setBaselineLeadId] = useState<string | null>(null);
  const addSearchRef = useRef<HTMLInputElement | null>(null);

  const draftExcludeParam = useMemo(
    () =>
      [...new Set(draft.map((m) => m.cleanerId).filter(Boolean))]
        .sort()
        .join(","),
    [draft],
  );

  const resetFromRoster = useCallback(() => {
    const rows = initialRoster.map((r) => ({
      cleanerId: r.cleaner_id,
      label: (r.cleaner_name ?? r.cleaner_id).trim() || r.cleaner_id,
    }));
    setDraft(rows);
    const leadRow = initialRoster.find((r) => String(r.role).toLowerCase() === "lead");
    const syncedLead = leadRow?.cleaner_id ?? null;
    setLeadId(syncedLead);
    setBaselineLeadId(syncedLead);
    setReason("");
    setSearch("");
    setHits([]);
    setReplaceForId(null);
    setError(null);
    setSuggestions([]);
    setAddExpanded(rows.length === 0);
  }, [initialRoster]);

  useEffect(() => {
    if (open && !locked) resetFromRoster();
  }, [open, locked, resetFromRoster]);

  useEffect(() => {
    if (replaceForId) setAddExpanded(true);
  }, [replaceForId]);

  useEffect(() => {
    if (!open || locked) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const sb = getSupabaseBrowser();
          const token = (await sb?.auth.getSession())?.data.session?.access_token;
          if (!token) {
            if (!cancelled) setHits([]);
            return;
          }
          const q = search.trim();
          const url = `/api/admin/cleaners?${new URLSearchParams({ limit: "20", ...(q ? { search: q } : {}) }).toString()}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const j = (await res.json()) as { cleaners?: CleanerHit[]; error?: string };
          if (!cancelled) {
            if (res.ok && Array.isArray(j.cleaners)) setHits(j.cleaners);
            else setHits([]);
          }
        } catch {
          if (!cancelled) setHits([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, open, locked]);

  useEffect(() => {
    if (!open || locked || !bookingId) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setSuggestLoading(true);
        try {
          const sb = getSupabaseBrowser();
          const token = (await sb?.auth.getSession())?.data.session?.access_token;
          if (!token) {
            if (!cancelled) setSuggestions([]);
            return;
          }
          const sp = new URLSearchParams({ limit: "8" });
          if (draftExcludeParam) sp.set("excludeCleanerIds", draftExcludeParam);
          const res = await fetch(
            `/api/admin/bookings/${encodeURIComponent(bookingId)}/replacement-candidates?${sp.toString()}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const j = (await res.json()) as ReplacementSuggestion[] | { error?: string };
          if (!cancelled) {
            if (res.ok && Array.isArray(j)) setSuggestions(j.slice(0, 8));
            else setSuggestions([]);
          }
        } catch {
          if (!cancelled) setSuggestions([]);
        } finally {
          if (!cancelled) setSuggestLoading(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, locked, bookingId, draftExcludeParam]);

  const addOrSwapFromHit = (hit: CleanerHit, ctx?: DraftContext) => {
    const id = hit.id.trim();
    if (!id) return;
    const label = (hit.full_name ?? "").trim() || id;
    const mergedCtx = ctx ?? contextFromHit(hit);

    if (replaceForId) {
      const roleWasLead = leadId === replaceForId;
      setDraft((prev) => {
        const next = prev.map((m) =>
          m.cleanerId === replaceForId ? { cleanerId: id, label, context: mergedCtx } : m,
        );
        return next;
      });
      if (roleWasLead) setLeadId(id);
      setReplaceForId(null);
      return;
    }

    if (draft.some((m) => m.cleanerId === id)) return;
    setDraft((prev) => [...prev, { cleanerId: id, label, context: mergedCtx }]);
  };

  const removeMember = (cleanerId: string) => {
    if (replaceForId === cleanerId) setReplaceForId(null);
    setDraft((prev) => {
      const next = prev.filter((m) => m.cleanerId !== cleanerId);
      queueMicrotask(() => {
        setLeadId((lid) => (lid === cleanerId ? null : lid));
      });
      return next;
    });
  };

  const focusAddSearch = () => {
    setAddExpanded(true);
    window.setTimeout(() => {
      document.getElementById("emergency-add-cleaners")?.scrollIntoView({ behavior: "smooth", block: "start" });
      addSearchRef.current?.focus();
    }, 0);
  };

  const save = async () => {
    if (locked || !bookingId) return;
    if (draft.length < 1) {
      setError("Add at least one cleaner.");
      return;
    }
    if (!leadId || !draft.some((m) => m.cleanerId === leadId)) {
      setError("Select a Team Lead.");
      return;
    }
    if (reason.trim().length < 2) {
      setError("Enter a reason (at least 2 characters).");
      window.requestAnimationFrame(() => {
        const el = document.getElementById("emergency-reason");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLTextAreaElement | null)?.focus();
      });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error("Please sign in as an admin.");
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/roster`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          members: draft.map((m) => ({
            cleanerId: m.cleanerId,
            role: m.cleanerId === leadId ? "lead" : "member",
          })),
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        hint?: string;
        booking_cleaners?: EmergencyRosterCleanerRow[];
      };
      if (!res.ok) {
        const msg =
          res.status === 409 ? (j.hint ?? j.error ?? BOOKING_ROSTER_LOCKED_HINT) : (j.error ?? "Save failed.");
        throw new Error(msg);
      }
      const roster = Array.isArray(j.booking_cleaners) ? j.booking_cleaners : [];
      onSaved(roster);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const rosterEmpty = draft.length === 0;
  const leadChanged =
    !locked &&
    !rosterEmpty &&
    baselineLeadId !== null &&
    leadId !== null &&
    baselineLeadId !== leadId &&
    draft.some((m) => m.cleanerId === leadId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Pin to viewport (override default centered translate — avoids bottom clip when roster is tall).
          "fixed z-50 flex translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden border border-zinc-200/90 bg-white p-0 shadow-xl",
          "dark:border-zinc-800 dark:bg-zinc-950",
          // Mobile: full-screen sheet. Desktop: tall centered panel (vertical insets only — no vertical translate clip).
          "inset-0 h-[100dvh] max-h-[100dvh] w-full max-w-full rounded-none border-x-0 border-b-0 border-t-0",
          "sm:inset-x-auto sm:left-1/2 sm:right-auto sm:top-4 sm:bottom-4 sm:h-[min(92dvh,calc(100dvh-2rem))] sm:max-h-[min(92dvh,calc(100dvh-2rem))] sm:w-[min(calc(100%-2rem),42rem)] sm:max-w-2xl sm:-translate-x-1/2 sm:translate-y-0 sm:rounded-xl sm:border",
          "[&>button]:text-zinc-400 [&>button]:opacity-70 [&>button:hover]:opacity-100",
        )}
      >
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-zinc-100 px-5 pb-3 pt-5 dark:border-zinc-800/80">
          <DialogTitle className="text-left text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Edit Job Roster
          </DialogTitle>
          <DialogDescription className="text-left text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Update the assigned cleaning team for this booking.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4 [scrollbar-gutter:stable]">
          {locked ? (
            <p className="rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200">
              This booking is locked (earnings finalized). {BOOKING_ROSTER_LOCKED_HINT}
            </p>
          ) : (
            <>
              {rosterEmpty ? (
                <div
                  className="flex gap-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100"
                  role="status"
                >
                  <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400">⚠</span>
                  <span>No cleaners on this roster. Add team members, then select a Team Lead before saving.</span>
                </div>
              ) : !leadId ? (
                <div
                  className="flex gap-2 rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2 text-xs leading-snug text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-amber-100"
                  role="status"
                >
                  <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400">⚠</span>
                  <span>Select a Team Lead below after adding all cleaners.</span>
                </div>
              ) : (
                <div className="flex gap-2 rounded-lg bg-zinc-50/90 px-3 py-2 text-xs leading-snug text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-400">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                  <span>Roster changes affect assignments and payouts.</span>
                </div>
              )}

              {replaceForId ? (
                <div className="rounded-lg bg-zinc-100/80 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300">
                  Replacing{" "}
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {draft.find((m) => m.cleanerId === replaceForId)?.label ?? "cleaner"}
                  </span>
                  . Choose someone in search or suggestions, then{" "}
                  <button
                    type="button"
                    className="font-medium text-zinc-900 underline decoration-zinc-400 underline-offset-2 hover:no-underline dark:text-zinc-100"
                    onClick={() => setReplaceForId(null)}
                  >
                    cancel
                  </button>
                  .
                </div>
              ) : null}

              <section className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Team{draft.length > 0 ? ` · ${draft.length}` : ""}
                  </h3>
                </div>
                <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                  Team Lead manages customer communication and payout responsibility.
                </p>

                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/90">
                  {rosterEmpty ? (
                    <li className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No cleaners assigned yet.
                    </li>
                  ) : (
                    draft.map((m) => {
                      const isLead = leadId === m.cleanerId;
                      const sub = contextSubtitle(m);
                      const rel = reliabilityHint(m);
                      return (
                        <li key={m.cleanerId} className="group py-2.5 first:pt-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <label className="flex min-w-0 flex-1 cursor-pointer gap-3 sm:items-start">
                              <input
                                type="radio"
                                name={`emergency-lead-${bookingId}`}
                                checked={isLead}
                                onChange={() => setLeadId(m.cleanerId)}
                                className="mt-1 h-4 w-4 shrink-0 border-zinc-300 text-blue-600 focus:ring-blue-600"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">{m.label}</span>
                                  {rel ? (
                                    <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                                      {rel}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                                  {isLead ? "Team Lead" : "Member"}
                                </span>
                                {sub ? (
                                  <span className="mt-0.5 block text-[11px] text-zinc-400 dark:text-zinc-500">{sub}</span>
                                ) : null}
                              </span>
                            </label>
                            <div
                              className={cn(
                                "flex shrink-0 items-center justify-end gap-1 pl-7 sm:pl-0",
                                "max-sm:w-full max-sm:justify-start",
                                "opacity-100 transition-opacity",
                                "lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100",
                              )}
                            >
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 min-h-[2rem] rounded-md border-zinc-200/90 bg-white px-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                                onClick={() => setReplaceForId(m.cleanerId)}
                              >
                                Replace
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 min-h-[2rem] px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                                onClick={() => removeMember(m.cleanerId)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>

                {leadChanged ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-blue-200/80 bg-blue-50/50 px-3 py-2.5 dark:border-blue-900/50 dark:bg-blue-950/30">
                    <p className="text-xs leading-snug text-zinc-700 dark:text-zinc-300">
                      Team Lead changed. Save to apply payout and communication responsibility.
                    </p>
                    <Button
                      type="button"
                      className="h-9 w-full shrink-0 rounded-lg text-sm font-semibold sm:w-auto sm:self-start"
                      disabled={saving}
                      onClick={() => void save()}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save Team Lead change"
                      )}
                    </Button>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="mt-1 w-full rounded-lg py-2 text-left text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  onClick={() => void focusAddSearch()}
                >
                  + Add another cleaner
                </button>
              </section>

              {addExpanded ? (
                <section id="emergency-add-cleaners" className="space-y-2 scroll-mt-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor="emergency-cleaner-search" className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Find cleaners
                    </Label>
                  </div>
                  <Input
                    ref={addSearchRef}
                    id="emergency-cleaner-search"
                    className="h-10 rounded-lg border-zinc-200/90 bg-white text-sm dark:border-zinc-700 dark:bg-zinc-950"
                    placeholder="Search by name or phone…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoComplete="off"
                  />
                  <div className="overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-900/30">
                    {/* Single outer scroll on the dialog body — list can grow so results are never trapped behind the footer */}
                    <div className="max-h-[min(55dvh,420px)] overflow-y-auto overscroll-contain sm:max-h-[min(50dvh,480px)]">
                      {searching ? (
                        <div className="flex items-center gap-2 px-3 py-4 text-sm text-zinc-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      ) : hits.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-zinc-500">
                          {search.trim()
                            ? "No matches. Try a different search."
                            : "Start typing to search the directory."}
                        </p>
                      ) : (
                        <ul>
                          {hits.map((h) => {
                            const onRoster = draft.some((m) => m.cleanerId === h.id);
                            const swapWouldDuplicate =
                              Boolean(replaceForId) && onRoster && h.id !== replaceForId;
                            const ctx = contextFromHit(h);
                            const line = [
                              ctx?.availability,
                              typeof h.rating === "number" ? `★ ${h.rating.toFixed(1)}` : null,
                              typeof h.jobs_completed === "number" && h.jobs_completed > 0
                                ? `${h.jobs_completed} jobs`
                                : null,
                              h.location?.trim() || null,
                            ]
                              .filter(Boolean)
                              .join(" · ");
                            return (
                              <li key={h.id} className="border-t border-zinc-100/90 first:border-t-0 dark:border-zinc-800/80">
                                <button
                                  type="button"
                                  disabled={(onRoster && !replaceForId) || swapWouldDuplicate}
                                  onClick={() => addOrSwapFromHit(h)}
                                  className="flex w-full flex-col items-stretch gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-zinc-950/80"
                                >
                                  <span className="flex items-center justify-between gap-2">
                                    <span className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
                                      {(h.full_name ?? "").trim() || h.id}
                                    </span>
                                    <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">
                                      {onRoster && !replaceForId ? "On roster" : replaceForId ? "Swap in" : "Add"}
                                    </span>
                                  </span>
                                  {line ? (
                                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{line}</span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Suggested additions
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Ranked for this booking location and slot.</p>
                <div className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                  {suggestLoading ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-sm text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading…
                    </div>
                  ) : suggestions.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                      No suggestions right now. Use search above.
                    </p>
                  ) : (
                    <ul className="max-h-[min(40dvh,320px)] space-y-1.5 overflow-y-auto overscroll-contain sm:max-h-[min(36dvh,360px)]">
                      {suggestions.map((s, idx) => (
                        <li
                          key={s.cleanerId}
                          className="flex flex-col gap-2 rounded-lg bg-white px-2.5 py-2 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                {s.name}
                              </span>
                              {idx === 0 ? (
                                <span className="shrink-0 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-zinc-100 dark:text-zinc-900">
                                  Top pick
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                              {replacementAvailabilityDisplayLabel(s.availability)}
                              {s.distanceKm != null ? ` · ${s.distanceKm} km` : ""}
                              {typeof s.rating === "number" ? ` · ★ ${s.rating.toFixed(1)}` : ""} · {s.totalJobs} jobs
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 rounded-md border-zinc-200 bg-white px-3 text-xs font-semibold dark:border-zinc-600 dark:bg-zinc-950"
                            onClick={() =>
                              addOrSwapFromHit(
                                { id: s.cleanerId, full_name: s.name, status: null },
                                contextFromSuggestion(s),
                              )
                            }
                          >
                            {replaceForId ? "Swap in" : "Add"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="space-y-1.5">
                <Label htmlFor="emergency-reason" className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Reason for change
                </Label>
                <Textarea
                  id="emergency-reason"
                  className="min-h-[68px] resize-y rounded-lg border-zinc-200/90 text-sm dark:border-zinc-700"
                  placeholder="e.g. No-show, customer requested a different lead…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                />
              </section>

              {error ? (
                <p
                  className="rounded-lg border border-rose-200/80 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-zinc-100 bg-white/95 px-5 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg border-zinc-200/90 dark:border-zinc-700"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" className="h-10 rounded-lg px-5 font-semibold" onClick={() => void save()} disabled={locked || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
