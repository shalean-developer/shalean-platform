"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addAdminTeamMembers,
  addAdminTeamMembersBatched,
  fetchAdminCleanersForTeamAdd,
  type AdminCleanerRow,
} from "@/lib/admin/dashboard";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CandidateRow } from "@/components/admin/teams/CandidateRow";
import { Loader2 } from "lucide-react";

const DEBOUNCE_MS = 300;
const MIN_SEARCH_LEN = 2;
const PAGE_LIMIT = 20;

export type TeamAddRosterFilter = "all" | "available" | "high_rated";

function SearchSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-[4.5rem] animate-pulse rounded-lg bg-zinc-200/90 dark:bg-zinc-800/90" />
      ))}
    </div>
  );
}

export function AddMembersPanel({
  teamId,
  memberCount,
  capacity,
  teamActive,
  onMemberAdded,
}: {
  teamId: string;
  memberCount: number;
  capacity: number;
  teamActive: boolean;
  onMemberAdded: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<TeamAddRosterFilter>("all");
  const [candidates, setCandidates] = useState<AdminCleanerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const addBusyRef = useRef(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(search.trim()), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const isFull = memberCount >= capacity;
  const slotsLeft = Math.max(0, capacity - memberCount);
  const canSearch = teamActive && !isFull;

  const shouldFetch = useCallback(() => {
    if (!canSearch) return false;
    if (filter === "available" || filter === "high_rated") return true;
    return debounced.length >= MIN_SEARCH_LEN;
  }, [canSearch, filter, debounced]);

  const loadCandidates = useCallback(async () => {
    if (!shouldFetch()) {
      setCandidates([]);
      setFetchError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const list = await fetchAdminCleanersForTeamAdd({
        excludeTeamId: teamId,
        search: debounced.length > 0 ? debounced : undefined,
        limit: PAGE_LIMIT,
        filter: filter === "all" ? undefined : filter,
      });
      setCandidates(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load cleaners.";
      setFetchError(msg);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [teamId, debounced, filter, shouldFetch]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    setSelected((prev) => {
      const ok = new Set(candidates.map((c) => c.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (ok.has(id)) next.add(id);
      }
      return next;
    });
  }, [candidates]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = candidates.length > 0 && candidates.every((c) => selected.has(c.id));

  const toggleSelectAll = useCallback(() => {
    setSelected(() => {
      if (allSelected) return new Set();
      return new Set(candidates.map((c) => c.id));
    });
  }, [allSelected, candidates]);

  const onQuickAdd = useCallback(
    async (cleanerId: string) => {
      if (!teamActive || isFull || slotsLeft <= 0 || addBusyRef.current) return;
      addBusyRef.current = true;
      setAddingId(cleanerId);
      try {
        const idempotencyKey =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const inserted = await addAdminTeamMembers(teamId, [cleanerId], { idempotencyKey });
        if (inserted === 0) {
          emitAdminToast("Could not add cleaner (already on team or invalid).", "info");
        } else {
          emitAdminToast("Cleaner added.", "success");
        }
        setSelected((s) => {
          const n = new Set(s);
          n.delete(cleanerId);
          return n;
        });
        await onMemberAdded();
        await loadCandidates();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not add member.";
        if (/capacity|full|exceeds/i.test(msg)) emitAdminToast("Team is full.", "error");
        else emitAdminToast(msg, "error");
      } finally {
        addBusyRef.current = false;
        setAddingId(null);
      }
    },
    [teamId, teamActive, isFull, slotsLeft, onMemberAdded, loadCandidates],
  );

  const onAddSelected = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0 || !teamActive || isFull || bulkAdding || addBusyRef.current) return;
    const allowed = Math.min(ids.length, slotsLeft);
    if (allowed <= 0) {
      emitAdminToast("Team is full.", "error");
      return;
    }
    const toSend = ids.slice(0, allowed);
    if (toSend.length < ids.length) {
      emitAdminToast(`Only ${allowed} slot(s) left — adding ${allowed} cleaner(s).`, "info");
    }
    setBulkAdding(true);
    addBusyRef.current = true;
    try {
      const inserted = await addAdminTeamMembersBatched(teamId, toSend);
      if (inserted === 0) {
        emitAdminToast("No cleaners were added.", "info");
      } else {
        emitAdminToast(`Added ${inserted} cleaner${inserted === 1 ? "" : "s"}.`, "success");
      }
      setSelected(new Set());
      await onMemberAdded();
      await loadCandidates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bulk add failed.";
      if (/capacity|full|exceeds/i.test(msg)) emitAdminToast("Team is full.", "error");
      else emitAdminToast(msg, "error");
    } finally {
      setBulkAdding(false);
      addBusyRef.current = false;
    }
  }, [selected, teamId, teamActive, isFull, slotsLeft, bulkAdding, onMemberAdded, loadCandidates]);

  const filterPill = (key: TeamAddRosterFilter, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      disabled={!canSearch}
      className={[
        "rounded-full px-3 py-1 text-xs font-semibold transition",
        filter === key
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
      ].join(" ")}
    >
      {label}
    </button>
  );

  const showHint =
    canSearch && filter === "all" && debounced.length < MIN_SEARCH_LEN && !loading;

  const showEmptyResults =
    canSearch && shouldFetch() && !loading && candidates.length === 0 && !fetchError;

  return (
    <section className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add cleaners</h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Search by name or phone, filter by availability or rating, then add individually or in bulk.
        </p>
      </div>

      {!teamActive ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          This team is paused. Activate the team before adding members.
        </p>
      ) : null}

      {isFull ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
          Team is full. Remove someone or raise capacity to add more.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {filterPill("all", "All")}
        {filterPill("available", "Available")}
        {filterPill("high_rated", "High rated")}
        <button
          type="button"
          disabled
          className="rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-400 dark:border-zinc-600 dark:text-zinc-500"
          title="Coming soon"
        >
          Nearby
        </button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="team-add-cleaner-search">Search</Label>
        <Input
          id="team-add-cleaner-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name or phone…"
          disabled={!canSearch}
          className="rounded-lg"
          autoComplete="off"
        />
      </div>

      {fetchError ? (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
          {fetchError}
        </p>
      ) : null}

      {loading && shouldFetch() ? <SearchSkeleton /> : null}

      {showHint ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Type at least {MIN_SEARCH_LEN} characters to search, or choose <strong>Available</strong> /{" "}
          <strong>High rated</strong> to browse.
        </p>
      ) : null}

      {showEmptyResults ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-6 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">No cleaners found</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Try another name or phone.</p>
        </div>
      ) : null}

      {!loading && canSearch && shouldFetch() && candidates.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg text-xs"
              onClick={toggleSelectAll}
              disabled={candidates.length === 0}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing up to {PAGE_LIMIT} · refine search to narrow results
            </p>
          </div>
          <ul className="max-h-[min(42vh,360px)] space-y-2 overflow-y-auto pr-1">
            {candidates.map((c) => (
              <CandidateRow
                key={c.id}
                cleaner={c}
                selected={selected.has(c.id)}
                onToggleSelect={toggleSelect}
                onQuickAdd={onQuickAdd}
                disabled={isFull || !teamActive || slotsLeft <= 0}
                busy={addingId === c.id || bulkAdding}
              />
            ))}
          </ul>
          {selected.size > 0 ? (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{selected.size}</span>{" "}
                selected
              </p>
              <Button
                type="button"
                size="sm"
                className="rounded-lg"
                disabled={bulkAdding || isFull || slotsLeft <= 0}
                onClick={() => void onAddSelected()}
              >
                {bulkAdding ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    Adding…
                  </>
                ) : (
                  "Add selected"
                )}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
