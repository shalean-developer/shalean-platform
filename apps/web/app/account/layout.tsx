import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountRouteLayout } from "@/components/account/AccountRouteLayout";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountRouteLayout>{children}</AccountRouteLayout>;
}
