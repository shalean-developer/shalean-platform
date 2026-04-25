import type { HomeService } from "@/lib/home/data";

type HowItWorksProps = {
  services: HomeService[];
};

export function HowItWorks({ services }: HowItWorksProps) {
  const steps = services.slice(0, 3).map((service, index) => ({
    title: service.title,
    body: service.description,
    number: index + 1,
  }));

  if (steps.length === 0) return null;

  return (
    <section className="bg-zinc-950 py-16 text-white sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">How It Works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Book in minutes</h2>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-sm font-bold">
                {step.number}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
