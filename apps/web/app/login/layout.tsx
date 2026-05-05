import type { Metadata } from "next";
import { noIndexNoFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexNoFollowCanonical("/login");

export default function LoginSegmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
