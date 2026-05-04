import { CalendarClock, ShieldCheck, WalletCards } from "lucide-react";

const ITEMS: { title: string; body: string; icon: typeof CalendarClock }[] = [
  {
    title: "Same-day booking",
    body: "Request today’s slots when capacity allows—compact visits in busy suburbs often place faster than large move-outs.",
    icon: CalendarClock,
  },
  {
    title: "Vetted cleaners",
    body: "Teams are onboarded and rated on real visits across Cape Town—consistent quality, not random gig workers.",
    icon: ShieldCheck,
  },
  {
    title: "Online checkout",
    body: "Lock scope and pay securely online with Shalean—your quote stays tied to the rooms and extras you selected.",
    icon: WalletCards,
  },
];

export function BlogPostQuickAnswers() {
  return (
    <section
      className="not-prose mt-8 grid gap-4 sm:grid-cols-3"
      aria-labelledby="blog-quick-answers-heading"
    >
      <h2 id="blog-quick-answers-heading" className="sr-only">
        Quick answers
      </h2>
      {ITEMS.map((item) => (
        <div
          key={item.title}
          className="flex gap-3 rounded-xl border border-zinc-200/90 bg-white px-4 py-4 shadow-sm ring-1 ring-zinc-950/[0.03]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <item.icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 sm:text-[13px]">{item.body}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
