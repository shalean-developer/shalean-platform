"use client";

import { Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdminTeamMemberRow } from "@/lib/admin/dashboard";

function formatJoined(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function activityLine(m: AdminTeamMemberRow): string {
  const rating =
    typeof m.rating === "number" && Number.isFinite(m.rating) ? `⭐ ${m.rating.toFixed(1)}` : null;
  const jobs =
    typeof m.jobs_completed === "number" && m.jobs_completed >= 0 ? `${m.jobs_completed} jobs` : null;
  const avail =
    m.is_available === true ? "🟢 Active" : m.is_available === false ? "🔴 Inactive" : "⚪ Unknown";
  return [rating, jobs, avail].filter(Boolean).join(" · ");
}

export function MemberRow({
  member,
  selected,
  onToggleSelect,
  pendingRemoveId,
  removingId,
  onBeginRemove,
  onConfirmRemove,
  onCancelRemove,
  teamActive,
  selectionEnabled,
}: {
  member: AdminTeamMemberRow;
  selected: boolean;
  onToggleSelect: (cleanerId: string) => void;
  pendingRemoveId: string | null;
  removingId: string | null;
  onBeginRemove: (cleanerId: string) => void;
  onConfirmRemove: (cleanerId: string) => void | Promise<void>;
  onCancelRemove: () => void;
  teamActive: boolean;
  selectionEnabled: boolean;
}) {
  const id = member.cleaner_id;
  const pending = pendingRemoveId === id;
  const busy = removingId === id;

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {selectionEnabled ? (
          <label className="flex cursor-pointer items-center gap-2 pt-0.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 text-sky-600 focus:ring-sky-500 dark:border-zinc-600"
              checked={selected}
              onChange={() => onToggleSelect(id)}
              aria-label={`Select ${member.name}`}
            />
          </label>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{member.name}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{member.phone?.trim() || "No phone"}</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{activityLine(member)}</p>
          {member.joined_at ? (
            <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">Joined {formatJoined(member.joined_at)}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled
            className="h-8 rounded-lg text-xs text-zinc-400"
            title="Lead role is managed on bookings — coming soon for templates."
          >
            <Crown className="mr-1 h-3.5 w-3.5" aria-hidden />
            Lead
          </Button>
          {!pending ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
              disabled={!teamActive || busy}
              title={!teamActive ? "Activate the team to change roster" : undefined}
              onClick={() => onBeginRemove(id)}
            >
              Remove
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50/80 px-2 py-1.5 dark:border-rose-900/50 dark:bg-rose-950/30">
              <span className="text-xs font-medium text-rose-900 dark:text-rose-100">
                Remove {member.name}?
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 rounded-md px-2 text-xs"
                disabled={busy}
                onClick={() => void onConfirmRemove(id)}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Confirm"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 rounded-md px-2 text-xs"
                disabled={busy}
                onClick={onCancelRemove}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
