"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AccountRouteLayout } from "@/components/account/AccountRouteLayout";

/**
 * `/account` redesign index is auth-free; legacy `/account/bookings` and `/account/recurring` keep the existing shell.
 */
export function AccountSegmentLayoutSwitcher({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/account") {
    return <>{children}</>;
  }

  return <AccountRouteLayout>{children}</AccountRouteLayout>;
}
