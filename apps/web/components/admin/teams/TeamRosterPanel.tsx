"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { removeAdminTeamMember, type AdminTeamMemberRow } from "@/lib/admin/dashboard";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { MemberRow } from "@/components/admin/teams/MemberRow";
import { BulkRemoveActions } from "@/components/admin/teams/BulkRemoveActions";

export function TeamRosterPanel({
  teamId,
  members,
  loading,
  teamActive,
  onAfterChange,
}: {
  teamId: string;
  members: AdminTeamMemberRow[];
  loading: boolean;
  teamActive: boolean;
  onAfterChange: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkRemoving, setBulkRemoving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.phone ?? "").toLowerCase().includes(q),
    );
  }, [members, query]);

  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(members.map((m) => m.cleaner_id));
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
      }
      return next;
    });
  }, [members]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => selected.has(m.cleaner_id));

  const toggleSelectAllFiltered = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const m of filtered) next.delete(m.cleaner_id);
      } else {
        for (const m of filtered) next.add(m.cleaner_id);
      }
      return next;
    });
  }, [filtered, allFilteredSelected]);

  const onConfirmSingleRemove = useCallback(
    async (cleanerId: string) => {
      setRemovingId(cleanerId);
      try {
        await removeAdminTeamMember(teamId, cleanerId);
        emitAdminToast("Member removed.", "success");
        setPendingRemoveId(null);
        setSelected((s) => {
          const n = new Set(s);
          n.delete(cleanerId);
          return n;
        });
        await onAfterChange();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not remove member.";
        emitAdminToast(msg, "error");
      } finally {
        setRemovingId(null);
      }
    },
    [teamId, onAfterChange],
  );

  const onConfirmBulkRemove = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkRemoving(true);
    let removed = 0;
    try {
      for (const cleanerId of ids) {
        try {
          await removeAdminTeamMember(teamId, cleanerId);
          removed++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Remove failed.";
          emitAdminToast(msg, "error");
          break;
        }
      }
      if (removed > 0) {
        emitAdminToast(removed === 1 ? "Member removed." : `${removed} members removed.`, "success");
      }
      setSelected(new Set());
      setBulkPending(false);
      setPendingRemoveId(null);
      await onAfterChange();
    } finally {
      setBulkRemoving(false);
    }
  }, [selected, teamId, onAfterChange]);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Team roster ({loading ? "…" : members.length})
        </h3>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name or phone…"
          className="max-w-xs rounded-lg text-sm"
          aria-label="Filter team members"
        />
      </div>

      {!loading && members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">No team members yet</p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Start by adding cleaners below.</p>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-busy>
          {[1, 2, 3].map((k) => (
            <div key={k} className="h-20 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No members match this filter.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg text-xs"
              onClick={toggleSelectAllFiltered}
              disabled={filtered.length === 0}
            >
              {allFilteredSelected ? "Clear visible" : "Select visible"}
            </Button>
          </div>
          <ul className="max-h-[min(40vh,320px)] space-y-2 overflow-y-auto pr-1">
            {filtered.map((m) => (
              <MemberRow
                key={m.cleaner_id}
                member={m}
                selected={selected.has(m.cleaner_id)}
                onToggleSelect={toggleSelect}
                pendingRemoveId={pendingRemoveId}
                removingId={removingId}
                onBeginRemove={(id) => {
                  setBulkPending(false);
                  setPendingRemoveId(id);
                }}
                onConfirmRemove={onConfirmSingleRemove}
                onCancelRemove={() => setPendingRemoveId(null)}
                teamActive={teamActive}
                selectionEnabled
              />
            ))}
          </ul>
          <BulkRemoveActions
            count={selected.size}
            teamActive={teamActive}
            removing={bulkRemoving}
            pendingConfirm={bulkPending}
            onBeginBulkRemove={() => {
              setPendingRemoveId(null);
              setBulkPending(true);
            }}
            onConfirmBulkRemove={onConfirmBulkRemove}
            onCancelBulkRemove={() => setBulkPending(false)}
          />
        </>
      )}
    </section>
  );
}
