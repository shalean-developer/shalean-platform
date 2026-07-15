import { ArrowRight } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

type Props = {
  source: string;
  className?: string;
};

export function InlineCTA({ source, className }: Props) {
  return (
    <div className={className}>
      <GrowthCtaLink
        href="/book"
        source={source}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        Get your exact price
        <ArrowRight className="size-4 shrink-0" aria-hidden />
      </GrowthCtaLink>
    </div>
  );
}
