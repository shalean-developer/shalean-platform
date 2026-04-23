import { CalendarRange, Leaf, ShieldCheck, Sparkles, Star, Wallet } from "lucide-react";

const features = [
  {
    title: "Trusted & vetted cleaners",
    body: "Every pro is reference-checked and reviewed by homeowners like you.",
    icon: ShieldCheck,
  },
  {
    title: "Easy online booking",
    body: "Choose service, rooms, and add-ons in one guided flow — no endless emails.",
    icon: CalendarRange,
  },
  {
    title: "Flexible scheduling",
    body: "Pick a slot that fits your calendar, including evenings where available.",
    icon: Sparkles,
  },
  {
    title: "Eco-friendly products",
    body: "Teams arrive with effective, family-conscious supplies — or use yours on request.",
    icon: Leaf,
  },
  {
    title: "Secure payments",
    body: "Pay at checkout with trusted processing — no surprise cash handling on the day.",
    icon: Wallet,
  },
  {
    title: "Satisfaction guarantee",
    body: "Something missed? Tell us within 24 hours and we will make it right.",
    icon: Star,
  },
] as const;

export function WhyChooseUsSection() {
  return (
    <section className="border-b border-blue-100 bg-blue-50/40 py-16" aria-labelledby="why-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="why-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Why families choose Shalean
          </h2>
          <p className="mt-3 text-gray-600">A premium marketplace experience with the warmth of a local cleaning crew.</p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <li key={f.title} className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-zinc-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
