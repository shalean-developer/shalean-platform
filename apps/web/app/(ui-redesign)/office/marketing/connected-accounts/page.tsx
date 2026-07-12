"use client";

import { Suspense } from "react";
import { ConnectedAccountsPanel } from "@/components/admin/promotions/ConnectedAccountsPanel";

export default function OfficeMarketingConnectedAccountsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <ConnectedAccountsPanel />
    </Suspense>
  );
}
