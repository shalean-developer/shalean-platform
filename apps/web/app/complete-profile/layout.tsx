import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Complete profile — Shalean",
};

export default function CompleteProfileLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
