"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

// Lazy-load the full legacy job detail page — it has all lifecycle logic
const LegacyJobDetail = dynamic(
  () => import("@/app/cleaner/jobs/[id]/page"),
  {
    loading: () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    ),
    ssr: false,
  },
);

export default function JobsJobDetailPage() {
  // Ensure params are available (dynamic import uses useParams internally)
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  if (!id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Invalid job ID.</p>
      </div>
    );
  }

  return <LegacyJobDetail />;
}
