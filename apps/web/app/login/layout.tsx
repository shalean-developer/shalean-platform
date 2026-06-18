import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { noIndexNoFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = {
  ...noIndexNoFollowCanonical("/login"),
  title: "Sign in — Shalean",
  description: "Sign in to your Shalean account as a customer or cleaner.",
};

export default function LoginSegmentLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
