import { Fragment } from "react";
import { MousePointerClick, Sparkles, Home, ArrowRight } from "lucide-react";

const STEPS = [
  {
    step: "1",
    Icon: MousePointerClick,
    title: "Book online",
    desc: "Choose your service, tell us about your space, and pick a time that suits you.",
  },
  {
    step: "2",
    Icon: Sparkles,
    title: "We clean",
    desc: "Our professional team arrives on time and gets to work.",
  },
  {
    step: "3",
    Icon: Home,
    title: "You relax",
    desc: "Come home to a spotless space. Clean and hassle-free, every time.",
  },
] as const;

export function MarketingHomeHowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-24 border-t border-slate-100 bg-white py-16 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            From booking to a fresh home
          </h2>
          <p className="mt-2 text-sm text-slate-500">Simple, fast and hassle-free.</p>
        </div>

        <div className="mt-12 flex flex-col items-stretch gap-4 sm:flex-row sm:items-start">
          {STEPS.map(({ step, Icon, title, desc }, index) => (
            <Fragment key={step}>
              <div className="flex flex-1 flex-col items-start gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-extrabold text-white">
                    {step}
                  </span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                    <Icon className="h-5 w-5 text-slate-700" strokeWidth={1.75} aria-hidden />
                  </div>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{desc}</p>
                </div>
              </div>
              {index < STEPS.length - 1 && (
                <div className="hidden items-center justify-center self-center sm:flex" aria-hidden>
                  <ArrowRight className="h-6 w-6 text-slate-300" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
