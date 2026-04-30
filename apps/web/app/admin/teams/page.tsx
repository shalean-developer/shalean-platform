"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAdminTeam,
  fetchAdminTeams,
  patchAdminTeamIsActive,
  type AdminTeamRow,
} from "@/lib/admin/dashboard";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { ManageTeamDialog } from "@/components/admin/teams/ManageTeamDialog";
import { cn } from "@/lib/utils";

/** Minimal team fields for display (API returns additional columns). */
export type Team = {
  id: string;
  name: string;
  capacity_per_day: number;
};

type TeamRow = Team & Pick<AdminTeamRow, "service_type" | "is_active" | "created_at" | "member_count">;

function mapErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message;
    if (m === "Please login." || /sign in as an admin/i.test(m)) return "Please login.";
    if (m === "Admin access required.") return "Admin access required.";
    return m;
  }
  return "Something went wrong. Check your connection and try again.";
}

function serviceLabel(st: string): string {
  if (st === "move_cleaning") return "Move cleaning";
  if (st === "deep_cleaning") return "Deep cleaning";
  return st;
}

function teamHealthLabel(memberCount: number, capacity: number): { text: string; className: string } {
  if (memberCount > capacity) {
    return { text: "Over capacity", className: "text-rose-600 dark:text-rose-400" };
  }
  if (memberCount === capacity && capacity > 0) {
    return { text: "Full", className: "text-emerald-600 dark:text-emerald-400" };
  }
  if (memberCount < capacity) {
    return { text: "Understaffed", className: "text-amber-600 dark:text-amber-400" };
  }
  return { text: "—", className: "text-zinc-400" };
}

export default function AdminTeamsPage() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamToggleBusyId, setTeamToggleBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCapacity, setCreateCapacity] = useState("3");
  const [createService, setCreateService] = useState<"deep_cleaning" | "move_cleaning">("deep_cleaning");
  const [createBusy, setCreateBusy] = useState(false);

  const [manageTeam, setManageTeam] = useState<TeamRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await fetchAdminTeams();
      setRows(
        list.map((t) => ({
          id: t.id,
          name: t.name,
          capacity_per_day: t.capacity_per_day,
          service_type: t.service_type,
          is_active: t.is_active,
          created_at: t.created_at,
          member_count: typeof t.member_count === "number" ? t.member_count : 0,
        })),
      );
    } catch (e) {
      setRows([]);
      setError(mapErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setManageTeam((prev) => {
      if (!prev) return prev;
      const r = rows.find((x) => x.id === prev.id);
      if (!r) return prev;
      return {
        ...prev,
        name: r.name,
        member_count: r.member_count,
        is_active: r.is_active,
        capacity_per_day: r.capacity_per_day,
        service_type: r.service_type,
      };
    });
  }, [rows]);

  async function onCreateTeam() {
    setCreateBusy(true);
    setError(null);
    try {
      const cap = Math.floor(Number(createCapacity));
      const name = createName.trim();
      if (!name) {
        emitAdminToast("Team name is required.", "error");
        return;
      }
      if (!Number.isFinite(cap) || cap <= 0) {
        emitAdminToast("Capacity per day must be a positive number.", "error");
        return;
      }
      await createAdminTeam({
        name,
        capacity_per_day: cap,
        service_type: createService,
      });
      setCreateOpen(false);
      setCreateName("");
      setCreateCapacity("3");
      setCreateService("deep_cleaning");
      emitAdminToast("Team created.", "success");
      await load();
    } catch (e) {
      const msg = mapErrorMessage(e);
      setError(msg);
      emitAdminToast(msg, "error");
    } finally {
      setCreateBusy(false);
    }
  }

  async function onToggleTeamActive(row: TeamRow) {
    setTeamToggleBusyId(row.id);
    setError(null);
    try {
      await patchAdminTeamIsActive(row.id, row.is_active !== true);
      emitAdminToast(row.is_active !== true ? "Team paused." : "Team activated.", "success");
      await load();
    } catch (e) {
      const msg = mapErrorMessage(e);
      setError(msg);
      emitAdminToast(msg, "error");
    } finally {
      setTeamToggleBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Teams</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Manage cleaning teams for dispatch</p>
      </div>

      {error ? (
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-sm font-medium",
            error === "Please login." || error === "Admin access required."
              ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
              : "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100",
          )}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" onClick={() => setCreateOpen(true)} className="rounded-lg">
          Create team
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading teams…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">No teams yet</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Create a team to use team-based dispatch.</p>
          <Button type="button" className="mt-5 rounded-lg" onClick={() => setCreateOpen(true)}>
            Create team
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
              <tr>
                <th className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">Name</th>
                <th className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">Service</th>
                <th className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">Members / capacity</th>
                <th className="px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">Active</th>
                <th className="px-4 py-3 text-right font-semibold text-zinc-900 dark:text-zinc-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((row) => {
                const mc = row.member_count ?? 0;
                const cap = row.capacity_per_day;
                const over = mc > cap;
                const health = teamHealthLabel(mc, cap);
                const healthIcon = over ? "✗" : mc === cap && cap > 0 ? "✓" : mc < cap ? "⚠" : "·";
                return (
                  <tr key={row.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{row.name}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{serviceLabel(row.service_type)}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      <span className="tabular-nums">{mc}</span> members{" "}
                      <span className="text-zinc-400">/</span> capacity{" "}
                      <span className="tabular-nums">{cap}</span>
                      <span className={cn("ml-2 inline-flex items-center gap-1 text-xs font-semibold", health.className)}>
                        <span aria-hidden>{healthIcon}</span>
                        {health.text}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg text-xs"
                        disabled={teamToggleBusyId === row.id}
                        onClick={() => void onToggleTeamActive(row)}
                      >
                        {teamToggleBusyId === row.id
                          ? "…"
                          : row.is_active === false
                            ? "Activate"
                            : "Pause"}
                      </Button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => setManageTeam(row)}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Sea Point Alpha"
                className="rounded-lg"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-cap">Capacity per day</Label>
              <Input
                id="team-cap"
                type="number"
                min={1}
                step={1}
                value={createCapacity}
                onChange={(e) => setCreateCapacity(e.target.value)}
                className="rounded-lg"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-service">Service type</Label>
              <select
                id="team-service"
                value={createService}
                onChange={(e) => setCreateService(e.target.value as "deep_cleaning" | "move_cleaning")}
                className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-600 dark:bg-zinc-950"
              >
                <option value="deep_cleaning">Deep cleaning</option>
                <option value="move_cleaning">Move cleaning</option>
              </select>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Required by the server so dispatch assigns the right booking type.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="rounded-lg" disabled={createBusy} onClick={() => void onCreateTeam()}>
              {createBusy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageTeamDialog
        team={manageTeam}
        open={manageTeam != null}
        onOpenChange={(next) => {
          if (!next) setManageTeam(null);
        }}
        onTeamUpdated={() => void load()}
        serviceLabel={serviceLabel}
      />
    </div>
  );
}
