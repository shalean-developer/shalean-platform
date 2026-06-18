import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Book a Cleaning | Shalean",
  description: "Book trusted cleaning services in Cape Town — regular, deep, moving, office, carpet and Airbnb cleaning.",
  robots: { index: false, follow: false },
};

export default function BookLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
