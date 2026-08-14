import Link from "next/link";
import { OfficeCleanerStatusManager } from "@/components/admin/office/OfficeCleanerStatusManager";
import { OfficeCleanersManageView } from "@/components/admin/office/OfficeCleanersManageView";

export default function OfficeCleanersPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 px-4 pt-4 sm:px-6">
        <Link className="rounded-lg border px-3 py-2 text-sm" href="/office/cleaner-performance">
          Canonical performance
        </Link>
        <Link className="rounded-lg border px-3 py-2 text-sm" href="/office/workforce/training">
          Training & compliance
        </Link>
      </div>
      <OfficeCleanerStatusManager />
      <div className="px-4 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Profiles, availability calendars and account management</p>
      </div>
      <OfficeCleanersManageView />
    </div>
  );
}
