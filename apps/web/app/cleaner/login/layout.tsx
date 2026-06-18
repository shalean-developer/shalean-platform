import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Cleaner sign in — Shalean",
};

export default function CleanerLoginLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
