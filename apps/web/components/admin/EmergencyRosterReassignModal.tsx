"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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

type DraftMember = { cleanerId: string; label: string };

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
    setLeadId(leadRow?.cleaner_id ?? rows[0]?.cleanerId ?? null);
    setReason("");
    setSearch("");
    setHits([]);
    setReplaceForId(null);
    setError(null);
    setSuggestions([]);
  }, [initialRoster]);

  useEffect(() => {
    if (open && !locked) resetFromRoster();
  }, [open, locked, resetFromRoster]);

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

  const addOrSwapFromHit = (hit: CleanerHit) => {
    const id = hit.id.trim();
    if (!id) return;
    const label = (hit.full_name ?? "").trim() || id;

    if (replaceForId) {
      const roleWasLead = leadId === replaceForId;
      setDraft((prev) => {
        const next = prev.map((m) => (m.cleanerId === replaceForId ? { cleanerId: id, label } : m));
        return next;
      });
      if (roleWasLead) setLeadId(id);
      setReplaceForId(null);
      return;
    }

    if (draft.some((m) => m.cleanerId === id)) return;
    setDraft((prev) => [...prev, { cleanerId: id, label }]);
    if (!leadId) setLeadId(id);
  };

  const removeMember = (cleanerId: string) => {
    setDraft((prev) => prev.filter((m) => m.cleanerId !== cleanerId));
    if (leadId === cleanerId) {
      const rest = draft.filter((m) => m.cleanerId !== cleanerId);
      setLeadId(rest[0]?.cleanerId ?? null);
    }
    if (replaceForId === cleanerId) setReplaceForId(null);
  };

  const save = async () => {
    if (locked || !bookingId) return;
    if (draft.length < 1) {
      setError("Add at least one cleaner.");
      return;
    }
    if (!leadId || !draft.some((m) => m.cleanerId === leadId)) {
      setError("Select a lead.");
      return;
    }
    if (reason.trim().length < 2) {
      setError("Enter a reason (at least 2 characters).");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,720px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <DialogTitle className="text-base font-semibold text-red-950 dark:text-red-200">
            Emergency reassign
          </DialogTitle>
          <DialogDescription className="text-left text-sm text-zinc-600 dark:text-zinc-400">
            Changes apply only to this booking&apos;s job roster (<span className="font-mono">booking_cleaners</span>).
            Team templates are not modified.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {locked ? (
            <p className="rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200">
              This booking is locked (earnings finalized). {BOOKING_ROSTER_LOCKED_HINT}
            </p>
          ) : (
            <>
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                <span className="shrink-0 font-semibold">⚠</span>
                <span>Changing the roster affects payouts and job responsibility. Use only for real operations issues.</span>
              </p>

              {replaceForId ? (
                <p className="rounded-md bg-sky-50 px-2 py-1.5 text-xs font-medium text-sky-950 dark:bg-sky-950/50 dark:text-sky-100">
                  Replacing a cleaner — pick someone from search below. Their role stays the same as the person you
                  replaced.
                </p>
              ) : null}

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current roster</Label>
                <ul className="mt-2 space-y-2">
                  {draft.length === 0 ? (
                    <li className="text-sm text-zinc-500">No cleaners on the roster yet. Add from search.</li>
                  ) : (
                    draft.map((m) => (
                      <li
                        key={m.cleanerId}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`emergency-lead-${bookingId}`}
                            checked={leadId === m.cleanerId}
                            onChange={() => setLeadId(m.cleanerId)}
                            className="shrink-0"
                          />
                          <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{m.label}</span>
                          <span className="shrink-0 text-[11px] font-semibold text-zinc-500">
                            {leadId === m.cleanerId ? "Lead" : "Member"}
                          </span>
                        </label>
                        <div className="ml-auto flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setReplaceForId(m.cleanerId)}
                          >
                            Replace
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-rose-600 hover:text-rose-800"
                            onClick={() => removeMember(m.cleanerId)}
                          >
                            Remove
                          </Button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-200">
                  Suggested replacements
                </Label>
                <div className="mt-2 rounded-md border border-orange-200/80 bg-orange-50/60 p-2 dark:border-orange-900/50 dark:bg-orange-950/30">
                  {suggestLoading ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-sm text-zinc-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading suggestions…
                    </div>
                  ) : suggestions.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                      No suitable replacements found. Try manual search below.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {suggestions.map((s, idx) => (
                        <li
                          key={s.cleanerId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/80 bg-white px-2 py-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                {s.name}
                              </span>
                              {idx === 0 ? (
                                <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                  Best match
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                              {typeof s.rating === "number" ? `⭐ ${s.rating.toFixed(1)}` : "⭐ —"} · {s.totalJobs}{" "}
                              jobs
                              {s.distanceKm != null ? ` · 📍 ${s.distanceKm} km` : ""} · Score {s.score}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 shrink-0 bg-orange-600 text-white hover:bg-orange-700"
                            onClick={() =>
                              addOrSwapFromHit({ id: s.cleanerId, full_name: s.name, status: s.availability })
                            }
                          >
                            {replaceForId ? "Swap in" : "Add"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="emergency-cleaner-search" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Add cleaners
                </Label>
                <Input
                  id="emergency-cleaner-search"
                  className="mt-1"
                  placeholder="Search by name or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                />
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700">
                  {searching ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-sm text-zinc-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching…
                    </div>
                  ) : hits.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-zinc-500">No results. Try another search.</p>
                  ) : (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {hits.map((h) => {
                        const onRoster = draft.some((m) => m.cleanerId === h.id);
                        const swapWouldDuplicate =
                          Boolean(replaceForId) && onRoster && h.id !== replaceForId;
                        return (
                          <li key={h.id}>
                            <button
                              type="button"
                              disabled={(onRoster && !replaceForId) || swapWouldDuplicate}
                              onClick={() => addOrSwapFromHit(h)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-900"
                            >
                              <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                                {(h.full_name ?? "").trim() || h.id}
                              </span>
                              <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                {onRoster && !replaceForId ? "On roster" : replaceForId ? "Swap in" : "Add"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="emergency-reason" className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Reason (required)
                </Label>
                <Textarea
                  id="emergency-reason"
                  className="mt-1 min-h-[72px] resize-y"
                  placeholder="e.g. Cleaner no-show, customer requested change…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                />
              </div>

              {error ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        <DialogFooter className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={locked || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save roster"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
