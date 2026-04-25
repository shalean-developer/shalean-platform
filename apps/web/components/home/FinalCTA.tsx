import Link from "next/link";
import type { HomeService } from "@/lib/home/data";
import { Button } from "@/components/ui/button";

type FinalCTAProps = {
  services: HomeService[];
};

export function FinalCTA({ services }: FinalCTAProps) {
  if (services.length === 0) return null;

  return (
    <section className="bg-blue-700 py-16 text-white sm:py-20">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">Book Shalean</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Ready for a cleaner home?</h2>
          <p className="mt-4 text-blue-50">{services.map((service) => service.title).slice(0, 3).join(" • ")}</p>
        </div>
        <Button asChild size="xl" className="bg-white text-blue-700 hover:bg-blue-50">
          <Link href="#hero-booking">Get Instant Price</Link>
        </Button>
      </div>
    </section>
  );
}
