import type { Metadata } from "next";
import { noIndexNoFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = {
  ...noIndexNoFollowCanonical("/login"),
  title:
    "Shalean Cleaning Services | Secure Login for Home Cleaning Bookings",
  description:
    "Secure login for customers, cleaners, and administrators at Shalean Cleaning Services.",
};

export default function LoginSegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}