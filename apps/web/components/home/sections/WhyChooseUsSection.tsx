import { CalendarRange, Leaf, ShieldCheck, Sparkles, Star, Wallet } from "lucide-react";

const features = [
  {
    title: "Trusted & vetted cleaners",
    body: "Every cleaner is checked, reviewed, and matched to real customer bookings.",
    icon: ShieldCheck,
  },
  {
    title: "Easy online booking",
    body: "Choose your service, rooms, extras, and time in one guided flow.",
    icon: CalendarRange,
  },
  {
    title: "Flexible scheduling",
    body: "Pick a slot that fits your day, with same-day availability when supply allows.",
    icon: Sparkles,
  },
  {
    title: "Transparent pricing",
    body: "Get your exact price before checkout, with no surprise cash handling on the day.",
    icon: Leaf,
  },
  {
    title: "Secure payments",
    body: "Pay online with trusted processing and clear booking records.",
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
            Why Choose Shalean?
          </h2>
          <p className="mt-3 text-gray-600">
            Built to remove the common doubts: trust, pricing, timing, payment, and what happens if something is missed.
          </p>
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
