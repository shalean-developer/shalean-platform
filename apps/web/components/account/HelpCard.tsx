import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type HelpCardProps = {
  compact?: boolean;
};

export function HelpCard({ compact }: HelpCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-green-100 bg-green-50",
        compact ? "p-4" : "p-5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={cn("font-semibold text-gray-900", compact && "text-sm")}>We&apos;re here to help</p>
          <p className={cn("mt-1 text-gray-600", compact ? "text-xs leading-snug" : "text-sm")}>
            Chat with our support team on WhatsApp.
          </p>
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-green-200",
            compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          <MessageCircle className={cn("text-green-700", compact ? "h-4 w-4" : "h-5 w-5")} strokeWidth={1.75} />
        </div>
      </div>
      <a
        href="https://wa.me/27825915525"
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 font-semibold text-white transition hover:bg-green-700",
          compact ? "mt-3 px-3 py-2 text-xs" : "mt-4 px-4 py-2.5 text-sm",
        )}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
        Chat now · 082 591 5525
      </a>
    </div>
  );
}
