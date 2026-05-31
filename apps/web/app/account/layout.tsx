import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountSegmentLayoutSwitcher } from "@/src/features/account/AccountSegmentLayoutSwitcher";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountSegmentLayoutSwitcher>{children}</AccountSegmentLayoutSwitcher>;
}
