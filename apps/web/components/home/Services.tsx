import Image from "next/image";
import type { HomeService } from "@/lib/home/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ServicesProps = {
  services: HomeService[];
};

export function Services({ services }: ServicesProps) {
  if (services.length === 0) return null;

  return (
    <section id="services" className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Services</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">Choose the right clean</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Card key={service.id} className="overflow-hidden">
              {service.imageUrl ? (
                <div className="relative aspect-[16/10] bg-blue-50">
                  <Image
                    src={service.imageUrl}
                    alt={service.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              ) : null}
              <CardHeader>
                {service.badge ? <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{service.badge}</p> : null}
                <CardTitle>{service.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-zinc-600">{service.description}</p>
                {service.features.length > 0 ? (
                  <ul className="mt-4 space-y-2 text-sm text-zinc-700">
                    {service.features.slice(0, 4).map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden />
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
