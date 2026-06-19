import type { MarketingHomeServiceCard } from "@/lib/marketing/marketingHomeServicePresentation";

type Props = {
  cards: MarketingHomeServiceCard[];
};

export function MarketingHomeCoreServicesSection({ cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <section aria-label="Service pricing overview" className="border-y border-slate-100 bg-white py-5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-3 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center sm:overflow-visible sm:pb-0">
          {cards.map(({ id, icon: Icon, title, priceLabel }) => (
            <div
              key={id}
              className="flex shrink-0 items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm sm:shrink"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <Icon className="h-4.5 w-4.5 text-blue-600" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="whitespace-nowrap text-sm font-semibold text-slate-800">{title}</p>
                {priceLabel ? (
                  <p className="text-xs text-slate-500">
                    From <span className="font-bold text-blue-600">{priceLabel}</span>
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
