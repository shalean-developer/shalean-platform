import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book Cleaning Services in Cape Town | Shalean",
  description:
    "Get instant pricing and book trusted cleaners in minutes. Choose your service, address, and time online.",
};

export default function BookingRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
