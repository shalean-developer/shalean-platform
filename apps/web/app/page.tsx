import type { Metadata } from "next";
import { HomePage } from "@/components/home/HomePage";

export const metadata: Metadata = {
  title: "Shalean Cleaning Services | Professional Home Cleaning in Cape Town",
  description:
    "Trusted cleaners, easy online booking, and spotless results. Instant estimates, secure checkout, and background-checked teams across Cape Town.",
  openGraph: {
    title: "Shalean Cleaning Services | Cape Town",
    description: "Book professional home cleaning in minutes — standard, deep, Airbnb, move, and carpet services.",
    type: "website",
  },
};

export default function Home() {
  return <HomePage />;
}
