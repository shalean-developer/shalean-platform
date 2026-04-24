import type { Metadata } from "next";
import { HomePage } from "@/components/home/HomePage";

export const metadata: Metadata = {
  title: "Home Cleaning Services in Cape Town | Shalean Cleaning Services",
  description:
    "Book trusted home cleaning services in Cape Town. Get instant prices for standard, deep, Airbnb, move-in/out, and carpet cleaning with vetted Shalean cleaners.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Home Cleaning Services in Cape Town | Shalean",
    description: "Book professional home cleaning in minutes — standard, deep, Airbnb, move-in/out, and carpet services.",
    type: "website",
  },
};

export default function Home() {
  return <HomePage />;
}
