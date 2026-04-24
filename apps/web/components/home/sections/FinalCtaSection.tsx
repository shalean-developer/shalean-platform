import { HomeBookingLink } from "@/components/home/HomeBookingLink";
import { cn } from "@/lib/utils";

export function FinalCtaSection() {
  return (
    <section className="bg-gradient-to-br from-blue-600 to-blue-500 py-16 text-white" aria-labelledby="final-cta-heading">
      <div className="mx-auto max-w-7xl px-4 text-center">
        <h2 id="final-cta-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to book your cleaning?
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-blue-50 sm:text-base">
          Get your price and secure your slot in minutes. Same-day cleaning slots may be available in Cape Town.
        </p>
        <HomeBookingLink
          source="home_final_cta"
          className={cn(
            "mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-8 py-3 text-base font-semibold text-blue-600 transition hover:bg-blue-50 sm:w-auto",
          )}
        >
          Get Instant Price
        </HomeBookingLink>
      </div>
    </section>
  );
}
