import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "How quickly can I get a same-day house cleaning in Cape Town?",
    a: "Same-day depends on cleaner availability in your area. Start a booking and we’ll show the soonest open slots — mornings fill fastest on weekends.",
  },
  {
    q: "Are your cleaners vetted and insured?",
    a: "We work with vetted cleaning professionals and prioritise teams with strong track records. Coverage details are confirmed during booking for peace of mind.",
  },
  {
    q: "What if I’m not happy with the clean?",
    a: "Tell us within 24 hours and we’ll make it right. Your satisfaction is core to how we operate.",
  },
  {
    q: "Do I need to be home during the clean?",
    a: "Many customers leave a key or access instructions. You choose what you’re comfortable with — we’ll follow your preferences in the booking notes.",
  },
  {
    q: "How is pricing calculated?",
    a: "Quotes factor in home size, service type, and any add-ons. You’ll see your total before payment — no surprise fees at the door.",
  },
] as const;

export function HomeFaq() {
  return (
    <section className="bg-zinc-50 px-4 py-14 sm:py-16 dark:bg-zinc-900/50">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">FAQ</h2>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">Quick answers before you book.</p>
        </div>
        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {faqs.map(({ q, a }) => (
            <Card key={q} className="overflow-hidden p-0">
              <details className="group border-0 dark:border-0">
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-left text-base font-semibold text-zinc-900 sm:p-5 dark:text-zinc-100",
                    "marker:content-none [&::-webkit-details-marker]:hidden",
                  )}
                >
                  <span>{q}</span>
                  <span className="text-zinc-400 transition group-open:rotate-180" aria-hidden>
                    ▼
                  </span>
                </summary>
                <div className="border-t border-zinc-100 px-4 pb-4 pt-0 text-sm leading-relaxed text-zinc-600 sm:px-5 sm:pb-5 dark:border-zinc-800 dark:text-zinc-400">
                  {a}
                </div>
              </details>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
