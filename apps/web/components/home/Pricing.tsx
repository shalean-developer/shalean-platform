import type { HomePricingTier } from "@/lib/home/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PricingProps = {
  pricingTiers: HomePricingTier[];
};

function priceLabel(price: number | null, cadence: string | null): string | null {
  if (price == null) return null;
  return `R ${price.toLocaleString("en-ZA")}${cadence ? ` ${cadence}` : ""}`;
}

export function Pricing({ pricingTiers }: PricingProps) {
  if (pricingTiers.length === 0) return null;

  return (
    <section id="pricing" className="bg-blue-50/70 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">Transparent starting prices</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {pricingTiers.map((tier) => (
            <Card key={tier.id} className="bg-white">
              <CardHeader>
                <CardTitle>{tier.title}</CardTitle>
                {tier.description ? <p className="text-sm leading-6 text-zinc-600">{tier.description}</p> : null}
              </CardHeader>
              <CardContent>
                {priceLabel(tier.price, tier.cadence) ? (
                  <p className="text-3xl font-bold text-blue-700">{priceLabel(tier.price, tier.cadence)}</p>
                ) : null}
                {tier.features.length > 0 ? (
                  <ul className="mt-5 space-y-2 text-sm text-zinc-700">
                    {tier.features.slice(0, 5).map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
