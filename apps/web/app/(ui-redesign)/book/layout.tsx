import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildTransactionalPageMetadata } from "@/lib/seo/transactionalPageMetadata";

export const metadata: Metadata = buildTransactionalPageMetadata({
  path: "/book",
  title: "Book a Cleaning | Shalean",
  description: "Book trusted cleaning services in Cape Town — regular, deep, moving, office, carpet and Airbnb cleaning.",
});

export default function BookLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
