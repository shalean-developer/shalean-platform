import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { noIndexNoFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = {
  ...noIndexNoFollowCanonical("/signup"),
  title: "Create account — Shalean",
  robots: { index: false, follow: false },
};

export default function SignupSegmentLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
