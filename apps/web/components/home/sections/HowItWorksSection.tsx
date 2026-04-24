import { CalendarCheck, Laptop, PartyPopper, UserCheck } from "lucide-react";

const steps = [
  { title: "Enter your details", body: "Choose your service, rooms, bathrooms, and any extras.", icon: Laptop },
  { title: "Get instant price", body: "See your live quote before checkout, with no surprise fees.", icon: CalendarCheck },
  { title: "Book your cleaning", body: "Secure your slot and share access notes for the cleaner.", icon: UserCheck },
  { title: "Enjoy a spotless home", body: "A vetted cleaner arrives and handles the clean.", icon: PartyPopper },
] as const;

export function HowItWorksSection() {
  return (
    <section className="border-b border-blue-100 bg-white py-16" aria-labelledby="how-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="how-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            How it works
          </h2>
          <p className="mt-3 text-gray-600">A simple booking flow that turns interest into a confirmed cleaning slot.</p>
        </div>

        <div className="relative mt-14">
          <div className="absolute left-4 top-10 hidden h-0.5 w-[calc(100%-2rem)] bg-gradient-to-r from-blue-200 via-blue-400 to-blue-200 md:block" aria-hidden />

          <ol className="grid gap-8 md:grid-cols-4 md:gap-4">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
                    <Icon className="h-7 w-7" aria-hidden />
                  </div>
                  <span className="mt-3 text-xs font-bold uppercase tracking-wide text-blue-600">Step {i + 1}</span>
                  <h3 className="mt-1 text-lg font-semibold text-zinc-900">{step.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{step.body}</p>
                  {i < steps.length - 1 ? (
                    <div className="my-4 h-8 w-px bg-blue-200 md:hidden" aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
