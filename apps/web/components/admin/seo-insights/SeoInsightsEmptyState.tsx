import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description: string;
  className?: string;
};

export function SeoInsightsEmptyState({ title, description, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-5 py-10 text-center dark:border-zinc-600 dark:bg-zinc-900/40",
        className,
      )}
    >
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>
      <p className="mt-4 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
        POST <span className="text-zinc-800 dark:text-zinc-300">/api/cron/seo-optimization</span> with{" "}
        <span className="text-zinc-800 dark:text-zinc-300">CRON_SECRET</span> (see deployment notes).
      </p>
    </div>
  );
}
