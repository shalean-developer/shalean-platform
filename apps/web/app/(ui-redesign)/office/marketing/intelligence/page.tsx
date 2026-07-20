"use client";

import { Suspense } from "react";
import { PlatformIntelligencePanel } from "@/components/admin/promotions/PlatformIntelligencePanel";

export default function OfficeMarketingIntelligencePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <PlatformIntelligencePanel />
    </Suspense>
  );
}
