"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchAdminTeamMembers, type AdminTeamMemberRow } from "@/lib/admin/dashboard";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { TeamCapacityBar } from "@/components/admin/teams/TeamCapacityBar";
import { TeamRosterPanel } from "@/components/admin/teams/TeamRosterPanel";
import { AddMembersPanel } from "@/components/admin/teams/AddMembersPanel";

export type ManageTeamDialogTeam = {
  id: string;
  name: string;
  capacity_per_day: number;
  service_type: string;
  is_active: boolean | null;
  member_count?: number;
};

type Props = {
  team: ManageTeamDialogTeam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTeamUpdated: () => void | Promise<void>;
  serviceLabel: (serviceType: string) => string;
};

export function ManageTeamDialog({ team, open, onOpenChange, onTeamUpdated, serviceLabel }: Props) {
  const [roster, setRoster] = useState<AdminTeamMemberRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const teamId = team?.id;

  const reloadRoster = useCallback(async () => {
    if (!teamId) {
      setRoster([]);
      setRosterLoading(false);
      return;
    }
    setRosterLoading(true);
    try {
      const m = await fetchAdminTeamMembers(teamId);
      setRoster(m);
    } catch {
      setRoster([]);
      emitAdminToast("Could not load team roster.", "error");
    } finally {
      setRosterLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!open || !teamId) {
      setRoster([]);
      setRosterLoading(false);
      return;
    }
    void reloadRoster();
  }, [open, teamId, reloadRoster]);

  const onAfterRosterChange = useCallback(async () => {
    await reloadRoster();
    await onTeamUpdated();
  }, [reloadRoster, onTeamUpdated]);

  const onMemberAdded = useCallback(async () => {
    await onAfterRosterChange();
  }, [onAfterRosterChange]);

  const memberCount = roster.length;
  const capacity = team?.capacity_per_day ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92vh,760px)] max-w-xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Manage team</DialogTitle>
          {team ? (
            <p className="text-left text-sm font-normal leading-relaxed text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{team.name}</span>
              {" · "}
              {serviceLabel(team.service_type)}
            </p>
          ) : null}
        </DialogHeader>

        {team ? (
          <div className="grid gap-6 py-2">
            <TeamCapacityBar current={memberCount} capacity={capacity} />
            <TeamRosterPanel
              teamId={team.id}
              members={roster}
              loading={rosterLoading}
              teamActive={team.is_active !== false}
              onAfterChange={onAfterRosterChange}
            />
            <AddMembersPanel
              key={team.id}
              teamId={team.id}
              memberCount={memberCount}
              capacity={capacity}
              teamActive={team.is_active !== false}
              onMemberAdded={onMemberAdded}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
