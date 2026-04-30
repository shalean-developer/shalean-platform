import { Home, ShieldCheck, Sparkles } from "lucide-react";

/** How it works — server-rendered. */
export function MarketingHomeHowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12 xl:gap-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-slate-500">— How It Works</p>
            <h2 className="mt-3 text-center text-2xl font-bold tracking-tight text-slate-900 md:text-3xl lg:text-left">
              From booking to a fresh home
            </h2>
          </div>
          <p className="max-w-xl text-base leading-relaxed text-slate-600 lg:max-w-none lg:pt-1">
            Three simple steps: tell us what you need, we send a vetted team with supplies, and you enjoy the results —
            with secure payment and easy rebooking.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:mt-16 sm:grid-cols-2 sm:gap-8 lg:mt-20 lg:grid-cols-3 lg:gap-8">
          {(
            [
              {
                step: "1",
                title: "Book online",
                desc: "Choose your service, tell us about your space, and pick a time that suits you.",
                icon: Sparkles,
              },
              {
                step: "2",
                title: "We clean",
                desc: "Your vetted team arrives with supplies and follows our structured quality checklist.",
                icon: ShieldCheck,
              },
              {
                step: "3",
                title: "You relax",
                desc: "Come home to a fresh space — pay securely online and rebook in a few taps.",
                icon: Home,
              },
            ] as const
          ).map((s) => (
            <div
              key={s.step}
              className="flex gap-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm">
                <s.icon className="h-6 w-6 text-slate-900" strokeWidth={1.5} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {s.step}</p>
                <h3 className="mt-1 text-base font-bold leading-snug text-slate-900 sm:text-lg">{s.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-slate-600">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
