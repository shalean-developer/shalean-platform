import { Check } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const included = ["Labour & supplies", "Vetted cleaner team", "Satisfaction-focused checklist", "Easy reschedule"];

const ctaClass = cn(
  "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500",
);

export function HomePricingPreview() {
  return (
    <section className="px-4 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">Pricing preview</h2>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            See a sample ballpark for a typical home — your live quote is personalised in the booking flow.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-lg">
          <Card className="border-zinc-200 shadow-md dark:border-zinc-700">
            <CardHeader className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
              <CardDescription>From</CardDescription>
              <CardTitle className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">R650</CardTitle>
              <CardDescription className="text-base">2-bed apartment · regular clean · indicative only</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <ul className="space-y-3">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <Check className="size-3" aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <GrowthCtaLink href="/booking?step=entry" source="home_pricing_card" className={ctaClass}>
                Get your exact price
              </GrowthCtaLink>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
