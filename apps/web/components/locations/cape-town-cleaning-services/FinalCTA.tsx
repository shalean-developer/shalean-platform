import Link from "next/link";
import { Button } from "@/components/ui/button";
import { bookingFlowHref, bookingFlowPromoExtra } from "@/lib/booking/bookingFlow";

export function FinalCTA() {
  const quoteHref = `${bookingFlowHref("quote", bookingFlowPromoExtra("SAVE10"))}&source=cape_town_main_footer`;
  const bookHref = `${bookingFlowHref("entry", bookingFlowPromoExtra("SAVE10"))}&source=cape_town_main_footer`;

  return (
    <section
      aria-labelledby="final-cta-heading"
      className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-800 px-6 py-12 text-center shadow-lg md:px-12 md:py-16 dark:border-blue-900/50 dark:from-blue-800 dark:via-blue-900 dark:to-zinc-950"
    >
      <h2 id="final-cta-heading" className="text-balance text-2xl font-semibold tracking-tight text-white md:text-3xl">
        Get an instant cleaning quote in Cape Town
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-blue-100 md:text-base">
        Book in under 60 seconds. No hidden fees.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button size="xl" variant="secondary" className="min-w-[220px] rounded-xl shadow-md" asChild>
          <Link href={quoteHref}>Instant quote</Link>
        </Button>
        <Button
          size="xl"
          variant="outline"
          className="min-w-[220px] rounded-xl border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/15"
          asChild
        >
          <Link href={bookHref}>Book a cleaner</Link>
        </Button>
      </div>
    </section>
  );
}
