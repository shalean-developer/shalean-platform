import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Welcome Back | Shalean",
  description: "Rebook your trusted Shalean cleaning service in just a few clicks.",
  robots: { index: false, follow: false },
};

export default function RebookLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
