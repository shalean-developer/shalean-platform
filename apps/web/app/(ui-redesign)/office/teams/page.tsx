"use client";

import { useState } from "react";
import { Users, RefreshCw, AlertCircle, Star, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

type TeamRow = {
  id: string;
  name: string | null;
  city_id: string | null;
  created_at: string;
  member_count?: number;
  active_member_count?: number;
  rating?: number | null;
  jobs_completed?: number | null;
  members?: Array<{ cleaner_id: string; full_name: string | null; role: string | null }>;
};

type TeamsResponse = {
  teams: TeamRow[];
};

export default function TeamsPage() {
  const [search, setSearch] = useState("");

  const { data, loading, error, refetch } = useAdminData<TeamsResponse>("/api/admin/teams");

  const teams = data?.teams ?? [];

  const filtered = teams.filter(
    (t) => !search || (t.name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teams</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage cleaning teams, members, and team assignments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Total teams",  value: loading ? "—" : teams.length },
          { label: "Active members", value: loading ? "—" : teams.reduce((s, t) => s + (t.active_member_count ?? t.member_count ?? 0), 0) },
          { label: "Jobs completed", value: loading ? "—" : teams.reduce((s, t) => s + (t.jobs_completed ?? 0), 0) },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search teams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300 shadow-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
          No teams found.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => {
            const memberCount = team.active_member_count ?? team.member_count ?? (team.members?.length ?? 0);
            const memberNames = team.members?.map((m) => m.full_name ?? "Cleaner") ?? [];

            return (
              <div
                key={team.id}
                className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  {team.rating != null && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      <span className="text-sm font-semibold text-slate-700">
                        {Number(team.rating).toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                <h3 className="mt-3 text-base font-bold text-slate-900">{team.name ?? "Unnamed Team"}</h3>

                <div className="mt-1 text-xs text-slate-500">
                  {memberCount} member{memberCount !== 1 ? "s" : ""}
                  {team.jobs_completed ? ` · ${team.jobs_completed} jobs` : ""}
                </div>

                {memberNames.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {memberNames.slice(0, 4).map((name) => (
                      <span
                        key={name}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {name}
                      </span>
                    ))}
                    {memberNames.length > 4 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        +{memberNames.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <a
                    href={`/admin/teams/${team.id}`}
                    className="flex-1 rounded-lg bg-blue-50 py-2 text-center text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                  >
                    View team
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
