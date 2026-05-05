import type { Metadata } from "next";
import { noIndexFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexFollowCanonical("/booking/recover");

export default function BookingRecoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
