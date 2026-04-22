"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { setReferralCapture } from "@/lib/referrals/client";

export function ReferralCapture() {
  const search = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const code = search.get("ref")?.trim();
    if (!code) return;
    const kind = pathname.startsWith("/cleaner/apply") ? "cleaner" : "customer";
    setReferralCapture(code, kind);
  }, [pathname, search]);

  return null;
}
