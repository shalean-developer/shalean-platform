"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createAdminTeam,
  deleteAdminTeam,
  fetchAdminTeams,
  patchAdminTeam,
  type AdminTeamRow,
} from "@/lib/admin/dashboard";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { ManageTeamDialog } from "@/components/admin/teams/ManageTeamDialog";
import { OfficeTeamDeleteDialog } from "@/components/admin/office/OfficeTeamDeleteDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TeamRow = AdminTeamRow & { member_count: number };

function serviceLabel(st: string): string {
  if (st === "move_cleaning") return "Move cleaning";
  if (st === "deep_cleaning") return "Deep cleaning";
  return st;
}

function mapErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message;
    if (m === "Please login." || /sign in as an admin/i.test(m)) return "Please sign in.";
    if (m === "Admin access required.") return "Admin access required.";
    return m;
  }
  return "Something went wrong. Check your connection and try again.";
}

export default function OfficeTeamsPage() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCapacity, setCreateCapacity] = useState("15");
  const [createService, setCreateService] = useState<"deep_cleaning" | "move_cleaning">("deep_cleaning");
  const [createBusy, setCreateBusy] = useState(false);

  const [editTeam, setEditTeam] = useState<TeamRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editCapacity, setEditCapacity] = useState("15");
  const [editService, setEditService] = useState<"deep_cleaning" | "move_cleaning">("deep_cleaning");
  const [editActive, setEditActive] = useState(true);
  const [editBusy, setEditBusy] = useState(false);

  const [manageTeam, setManageTeam] = useState<TeamRow | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<TeamRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await fetchAdminTeams();
      setRows(
        list.map((t) => ({
          ...t,
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
      return r ? { ...prev, ...r } : prev;
    });
  }, [rows]);

  const filtered = rows.filter(
    (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function onCreateTeam() {
    setCreateBusy(true);
    try {
      const name = createName.trim();
      const cap = Math.floor(Number(createCapacity));
      if (!name) {
        emitAdminToast("Team name is required.", "error");
        return;
      }
      if (!Number.isFinite(cap) || cap < 2 || cap > 15) {
        emitAdminToast("Max roster members must be between 2 and 15.", "error");
        return;
      }
      await createAdminTeam({ name, capacity_per_day: cap, service_type: createService });
      setCreateOpen(false);
      setCreateName("");
      setCreateCapacity("15");
      setCreateService("deep_cleaning");
      emitAdminToast("Team created.", "success");
      await load();
    } catch (e) {
      const msg = mapErrorMessage(e);
      emitAdminToast(msg, "error");
    } finally {
      setCreateBusy(false);
    }
  }

  function openEdit(row: TeamRow) {
    setEditTeam(row);
    setEditName(row.name);
    setEditCapacity(String(row.capacity_per_day));
    setEditService(row.service_type === "move_cleaning" ? "move_cleaning" : "deep_cleaning");
    setEditActive(row.is_active !== false);
  }

  async function onSaveEdit() {
    if (!editTeam) return;
    setEditBusy(true);
    try {
      const name = editName.trim();
      const cap = Math.floor(Number(editCapacity));
      if (!name) {
        emitAdminToast("Team name is required.", "error");
        return;
      }
      if (!Number.isFinite(cap) || cap < 2 || cap > 15) {
        emitAdminToast("Max roster members must be between 2 and 15.", "error");
        return;
      }
      await patchAdminTeam(editTeam.id, {
        name,
        capacity_per_day: cap,
        is_active: editActive,
        service_type: editService,
      });
      setEditTeam(null);
      emitAdminToast("Team updated.", "success");
      await load();
    } catch (e) {
      emitAdminToast(mapErrorMessage(e), "error");
    } finally {
      setEditBusy(false);
    }
  }

  async function onToggleActive(row: TeamRow) {
    setToggleBusyId(row.id);
    try {
      await patchAdminTeam(row.id, { is_active: row.is_active === false });
      emitAdminToast(row.is_active === false ? "Team activated." : "Team paused.", "success");
      await load();
    } catch (e) {
      emitAdminToast(mapErrorMessage(e), "error");
    } finally {
      setToggleBusyId(null);
    }
  }

  async function onConfirmDelete() {
    if (!deleteTeam) return;
    setDeleteBusy(true);
    try {
      await deleteAdminTeam(deleteTeam.id);
      setDeleteTeam(null);
      emitAdminToast("Team deleted.", "success");
      await load();
    } catch (e) {
      emitAdminToast(mapErrorMessage(e), "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  const totalMembers = rows.reduce((s, t) => s + t.member_count, 0);
  const activeTeams = rows.filter((t) => t.is_active !== false).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teams</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Create teams and manage rosters here. To put a team on a deep or move job, open{" "}
            <Link href="/office/bookings" className="font-semibold text-blue-600 hover:underline">
              Office → Bookings
            </Link>
            , open the booking, and choose Assign team. Each team takes 1 job/day; up to 3 team bookings per day total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create team
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void load()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Total teams", value: loading ? "—" : rows.length },
          { label: "Active teams", value: loading ? "—" : activeTeams },
          { label: "Roster members", value: loading ? "—" : totalMembers },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="relative min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search teams…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center shadow-sm">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No teams found</p>
          <p className="mt-1 text-sm text-slate-500">Create a team to start dispatching deep and move jobs.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create team
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Team</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Service</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Members</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((row) => {
                const mc = row.member_count;
                const cap = row.capacity_per_day;
                const inactive = row.is_active === false;
                const rosterLow = mc < 2;
                return (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.name}</p>
                      {rosterLow ? (
                        <p className="mt-0.5 text-xs text-amber-600">Needs at least 2 members to take jobs</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{serviceLabel(row.service_type)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {mc} / {cap}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          inactive ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700",
                        )}
                      >
                        {inactive ? "Paused" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setManageTeam(row)}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                        >
                          Manage
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              aria-label="Team actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setManageTeam(row)}>
                              <UserPlus className="mr-2 h-4 w-4" />
                              Add / remove members
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit team
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={toggleBusyId === row.id}
                              onClick={() => void onToggleActive(row)}
                            >
                              {inactive ? (
                                <>
                                  <PlayCircle className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              ) : (
                                <>
                                  <Pause className="mr-2 h-4 w-4" />
                                  Pause
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => setDeleteTeam(row)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete team
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create team */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <label htmlFor="office-team-name" className="text-sm font-medium text-slate-700">
                Team name
              </label>
              <input
                id="office-team-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Claremont Alpha"
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-blue-300 focus:outline-none"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="office-team-cap" className="text-sm font-medium text-slate-700">
                Max roster members (2–15)
              </label>
              <input
                id="office-team-cap"
                type="number"
                min={2}
                max={15}
                value={createCapacity}
                onChange={(e) => setCreateCapacity(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-blue-300 focus:outline-none"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="office-team-service" className="text-sm font-medium text-slate-700">
                Primary service label
              </label>
              <select
                id="office-team-service"
                value={createService}
                onChange={(e) => setCreateService(e.target.value as "deep_cleaning" | "move_cleaning")}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-blue-300 focus:outline-none"
              >
                <option value="deep_cleaning">Deep cleaning</option>
                <option value="move_cleaning">Move cleaning</option>
              </select>
              <p className="text-xs text-slate-500">
                Teams with at least two roster members can take both deep and move jobs once assigned from Office →
                Bookings.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={createBusy}
              onClick={() => void onCreateTeam()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {createBusy ? "Creating…" : "Create team"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit team */}
      <Dialog open={editTeam != null} onOpenChange={(open) => !open && setEditTeam(null)}>
        <DialogContent className="max-w-md rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle>Edit team</DialogTitle>
          </DialogHeader>
          {editTeam ? (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <label htmlFor="office-edit-name" className="text-sm font-medium text-slate-700">
                  Team name
                </label>
                <input
                  id="office-edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-blue-300 focus:outline-none"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="office-edit-cap" className="text-sm font-medium text-slate-700">
                  Max roster members (2–15)
                </label>
                <input
                  id="office-edit-cap"
                  type="number"
                  min={2}
                  max={15}
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                  className="h-10 rounded-xl border border-slate-200 px-3 text-sm focus:border-blue-300 focus:outline-none"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="office-edit-service" className="text-sm font-medium text-slate-700">
                  Primary service label
                </label>
                <select
                  id="office-edit-service"
                  value={editService}
                  onChange={(e) => setEditService(e.target.value as "deep_cleaning" | "move_cleaning")}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-blue-300 focus:outline-none"
                >
                  <option value="deep_cleaning">Deep cleaning</option>
                  <option value="move_cleaning">Move cleaning</option>
                </select>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Team is active for dispatch
              </label>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setEditTeam(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={editBusy}
              onClick={() => void onSaveEdit()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editBusy ? "Saving…" : "Save changes"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageTeamDialog
        team={manageTeam}
        open={manageTeam != null}
        onOpenChange={(open) => {
          if (!open) setManageTeam(null);
        }}
        onTeamUpdated={() => void load()}
        serviceLabel={serviceLabel}
      />

      <OfficeTeamDeleteDialog
        open={deleteTeam != null}
        teamName={deleteTeam?.name ?? null}
        busy={deleteBusy}
        onOpenChange={(open) => {
          if (!open) setDeleteTeam(null);
        }}
        onConfirm={() => void onConfirmDelete()}
      />
    </div>
  );
}
