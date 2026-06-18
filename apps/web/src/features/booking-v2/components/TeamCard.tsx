"use client";

import { Users, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Team = {
  id: string;
  name: string;
  available: boolean;
};

type Props = {
  team: Team;
  isSelected: boolean;
  onSelect: () => void;
};

export function TeamCard({ team, isSelected, onSelect }: Props) {
  return (
    <button
      type="button"
      disabled={!team.available}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-sm font-medium transition",
        !team.available &&
          "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300",
        team.available &&
          isSelected &&
          "border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-600/10",
        team.available &&
          !isSelected &&
          "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:shadow-sm",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          !team.available && "bg-slate-100",
          team.available && isSelected && "bg-blue-100",
          team.available && !isSelected && "bg-slate-100",
        )}
      >
        {isSelected && team.available ? (
          <CheckCircle2 className="h-5 w-5 text-blue-600" aria-label="Selected" />
        ) : (
          <Users
            className={cn(
              "h-5 w-5",
              !team.available ? "text-slate-300" : "text-slate-500",
            )}
            aria-hidden
          />
        )}
      </div>

      <span>{team.name}</span>

      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium",
          team.available
            ? isSelected
              ? "bg-blue-100 text-blue-700"
              : "bg-green-50 text-green-700"
            : "bg-slate-100 text-slate-400",
        )}
      >
        {team.available ? "Available" : "Booked"}
      </span>
    </button>
  );
}
