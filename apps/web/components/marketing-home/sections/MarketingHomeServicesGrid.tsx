import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { MarketingHomeServiceCard } from "@/lib/marketing/marketingHomeServicePresentation";

type Props = {
  cards: MarketingHomeServiceCard[];
};

export function MarketingHomeServicesGrid({ cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <section id="our-services" className="scroll-mt-24 bg-white py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Our cleaning services
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ id, image, imageAlt, title, description, priceLabel, href }) => (
            <Link
              key={id}
              href={href}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden">
                <Image
                  src={image}
                  alt={imageAlt}
                  fill
                  className="object-cover object-center transition duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                <p className="mt-1 flex-1 text-sm leading-relaxed text-slate-500">{description}</p>
                {priceLabel ? (
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      From <span className="font-bold text-blue-600">{priceLabel}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-blue-600" aria-hidden />
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end">
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-blue-600" aria-hidden />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/services"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            View all services
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
