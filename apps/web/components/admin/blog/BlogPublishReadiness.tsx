import { Check, Circle } from "lucide-react";
import { MIN_WORDS_PUBLISH, type PublishValidationResult } from "@/lib/blog/seo/publish-validation";

export function BlogPublishReadiness({ preview, readingTimeMinutes }: { preview: PublishValidationResult; readingTimeMinutes: number | null }) {
  const checks = [
    [`${preview.wordCount.toLocaleString()} / ${MIN_WORDS_PUBLISH} words`, preview.wordCount >= MIN_WORDS_PUBLISH],
    ["H2 heading with text", preview.hasH2Section],
    ["Complete FAQ answers", preview.hasFaq],
    ["Internal links", preview.hasInternalLinks],
  ] as const;
  return <section aria-label="Publication readiness" className="space-y-3">
    <div className={preview.ok ? "rounded-lg bg-emerald-50 p-3 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100" : "rounded-lg bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100"}>
      <p className="text-sm font-semibold">{preview.ok ? "Ready for final checks" : "Not ready to publish"}</p>
      <p className="mt-1 text-xs leading-relaxed">{preview.ok ? "Review your writing and featured image. Saving runs the final permission, link and image checks." : "You can save a draft while you finish these requirements."}</p>
    </div>
    <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
      {checks.map(([label, ok]) => <li key={label} className="flex items-center gap-2">
        {ok ? <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />}
        <span><span className="sr-only">{ok ? "Complete: " : "Required: "}</span>{label}</span>
      </li>)}
    </ul>

    <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">Shared booking section and booking link appear once, after the article and FAQ.</p>
    <p className="border-t border-zinc-200 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">Structure checks only · {preview.wordCount > 0 && readingTimeMinutes != null ? `~${readingTimeMinutes} min read` : "No article text yet"}</p>
  </section>;
}
