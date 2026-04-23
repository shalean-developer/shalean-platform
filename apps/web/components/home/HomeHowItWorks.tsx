import { CalendarCheck, Home, Sofa } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    icon: CalendarCheck,
    title: "Book",
    body: "Choose your service, home size, and a time that works — online in minutes.",
  },
  {
    icon: Home,
    title: "We Clean",
    body: "A vetted team arrives with supplies and follows your checklist.",
  },
  {
    icon: Sofa,
    title: "Relax",
    body: "Come back to a fresh home. Rate your clean and rebook anytime.",
  },
] as const;

export function HomeHowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 px-4 py-14 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">How it works</h2>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            Three simple steps from booking to spotless — built for busy Cape Town households.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <Card key={title} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Icon className="size-6" aria-hidden />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Step {i + 1}
                </p>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
