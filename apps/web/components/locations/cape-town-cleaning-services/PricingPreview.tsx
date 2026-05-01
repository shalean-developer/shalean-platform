import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bookingFlowHref, bookingFlowPromoExtra } from "@/lib/booking/bookingFlow";

const rows = [
  { service: "Standard clean (2 bed)", from: "From R450" },
  { service: "Deep clean (2 bed)", from: "From R890" },
  { service: "Move-out (2 bed)", from: "From R1 050" },
  { service: "Airbnb turnover", from: "From R520" },
] as const;

export function PricingPreview() {
  const quoteHref = `${bookingFlowHref("quote", bookingFlowPromoExtra("SAVE10"))}&source=cape_town_main_pricing`;

  return (
    <section aria-labelledby="pricing-heading" className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 md:p-8">
      <h2 id="pricing-heading" className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-50">
        Example pricing
      </h2>
      <p className="mt-3 max-w-3xl text-pretty text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
        Cleaning prices in Cape Town vary depending on home size and service type. Most bookings start from affordable hourly rates, with full-service options available for deep cleaning and move-out cleaning.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500 dark:text-zinc-500">
        Figures below are indicative; your instant quote reflects bedrooms, bathrooms, and add-ons at checkout.
      </p>
      <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Guide</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.service}>
                <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">{r.service}</TableCell>
                <TableCell className="text-right text-zinc-700 dark:text-zinc-300">{r.from}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-8 flex justify-center">
        <Button size="lg" className="rounded-xl px-8 shadow-md" asChild>
          <Link href={quoteHref}>Get exact quote</Link>
        </Button>
      </div>
    </section>
  );
}
