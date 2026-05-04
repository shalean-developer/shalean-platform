import { Quote } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  quote: string;
  author: string;
  initials: string;
  suburb: string;
  className?: string;
};

export function ReviewCard({ quote, author, initials, suburb, className }: Props) {
  return (
    <figure
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8",
        className,
      )}
    >
      <Quote className="absolute right-5 top-5 size-10 text-emerald-100 sm:size-12" strokeWidth={1} aria-hidden />
      <blockquote className="relative flex-1 pt-2 text-base leading-relaxed text-zinc-700 sm:text-[17px]">&ldquo;{quote}&rdquo;</blockquote>
      <figcaption className="relative mt-6 flex items-center gap-4 border-t border-zinc-100 pt-6">
        <div
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-900 ring-2 ring-white shadow"
          aria-hidden
        >
          {initials}
        </div>
        <div>
          <cite className="not-italic">
            <span className="block font-bold text-zinc-900">{author}</span>
            <span className="mt-0.5 block text-sm text-zinc-500">{suburb}</span>
          </cite>
        </div>
      </figcaption>
    </figure>
  );
}
