import type { Metadata } from "next";
import { noIndexNoFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexNoFollowCanonical("/auth/login");

export default function AuthLoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
