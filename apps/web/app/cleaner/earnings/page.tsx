import { Suspense } from "react";
import { CleanerEarningsScreen } from "@/components/cleaner-dashboard/CleanerEarningsScreen";

export default function CleanerEarningsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
      <CleanerEarningsScreen />
    </Suspense>
  );
}
