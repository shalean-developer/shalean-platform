import type { Metadata } from "next";
import Link from "next/link";
import { SERVICES } from "@/lib/services";

export const metadata: Metadata = {
  title: "Cleaning services | Shalean Cleaning Services",
  description:
    "Browse Shalean home cleaning services in Cape Town — standard, deep, Airbnb turnover, move-out, and more.",
  alternates: { canonical: "/services" },
};

export default function ServicesIndexPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Our cleaning services</h1>
      <p className="mt-3 text-slate-600">
        Choose a service for details, pricing, and booking in a few minutes.
      </p>
      <ul className="mt-8 space-y-3">
        {SERVICES.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/services/${s.slug}`}
              className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
