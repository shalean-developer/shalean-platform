import { Card, CardContent } from "@/components/ui/card";

export function HomeBeforeAfter() {
  return (
    <section className="bg-zinc-100 px-4 py-14 sm:py-16 dark:bg-zinc-900">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">Before &amp; after</h2>
          <p className="mt-3 text-base text-zinc-600 dark:text-zinc-400">
            Real transformations from kitchens to lounges — photos coming soon from Cape Town customers.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Card className="overflow-hidden border-zinc-200 dark:border-zinc-700">
            <div className="aspect-[4/3] bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-800 dark:to-zinc-700" />
            <CardContent className="p-4">
              <p className="text-center text-sm font-semibold text-zinc-800 dark:text-zinc-200">Before</p>
              <p className="mt-1 text-center text-xs text-zinc-600 dark:text-zinc-400">Placeholder — kitchen &amp; living clutter</p>
            </CardContent>
          </Card>
          <Card className="overflow-hidden border-emerald-200 ring-1 ring-emerald-100 dark:border-emerald-900 dark:ring-emerald-950">
            <div className="aspect-[4/3] bg-gradient-to-br from-emerald-100 via-white to-emerald-50 dark:from-emerald-950 dark:via-zinc-900 dark:to-emerald-950/50" />
            <CardContent className="p-4">
              <p className="text-center text-sm font-semibold text-emerald-800 dark:text-emerald-200">After</p>
              <p className="mt-1 text-center text-xs text-zinc-600 dark:text-zinc-400">Placeholder — spotless surfaces &amp; fresh floors</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
