import Image from "next/image";
import type { HomeService } from "@/lib/home/data";

type BeforeAfterProps = {
  services: HomeService[];
};

export function BeforeAfter({ services }: BeforeAfterProps) {
  const visualServices = services.filter((service) => service.imageUrl).slice(0, 2);
  if (visualServices.length === 0) return null;

  return (
    <section className="bg-zinc-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Before/After</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">See the standard</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {visualServices.map((service) => (
            <div key={service.id} className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
              <div className="relative aspect-[4/3] bg-blue-50">
                <Image
                  src={service.imageUrl!}
                  alt={service.title}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-5">
                <h3 className="font-semibold text-zinc-950">{service.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{service.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
