import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CleanerAppRouteLayout } from "@/components/cleaner/CleanerAppRouteLayout";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CleanerLayout({ children }: { children: ReactNode }) {
  return <CleanerAppRouteLayout>{children}</CleanerAppRouteLayout>;
}
