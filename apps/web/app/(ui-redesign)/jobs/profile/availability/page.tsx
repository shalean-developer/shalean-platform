"use client";

import { ProfileSettingsBackLink } from "@/components/cleaner/ProfileSettingsBackLink";
import { CleanerWorkSettingsCard } from "@/components/cleaner-dashboard/CleanerWorkSettingsCard";

export default function ProfileAvailabilityPage() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-6 space-y-4">
      <ProfileSettingsBackLink />
      <div>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Availability</h1>
        <p className="mt-0.5 text-sm text-slate-400">Manage your working days and hours</p>
      </div>

      <CleanerWorkSettingsCard />
    </div>
  );
}
