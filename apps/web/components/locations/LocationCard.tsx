import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  slug: string;
  description: string;
  className?: string;
};

/**
 * Hub preview card — links to `/locations/{slug}` (slug includes `-cleaning-services`).
 */
export function LocationCard({ name, slug, description, className }: Props) {
  const href = `/locations/${slug}`;

  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition",
        "hover:border-emerald-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold tracking-tight text-zinc-900">{name}</h3>
        <ArrowRight
          className="mt-0.5 size-5 shrink-0 text-emerald-600 opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden
        />
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">{description}</p>
      <span className="mt-4 inline-flex items-center text-sm font-semibold text-emerald-800">
        View services
        <ArrowRight className="ml-1 size-4 transition group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
