import { Suspense } from "react";
import OfficePayoutApprovalsClient from "./OfficePayoutApprovalsClient";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading approvals…</p>}>
      <OfficePayoutApprovalsClient />
    </Suspense>
  );
}
