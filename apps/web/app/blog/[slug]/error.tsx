"use client";

import Link from "next/link";

/**
 * Catches uncaught errors under `/blog/[slug]` (runtime bugs outside guarded paths).
 * Prefer fixing root cause — this avoids a blank 500 for visitors.
 */
export default function BlogArticleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Something went wrong</h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-600">
        We couldn&apos;t load this article. You can try again or browse other cleaning guides.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Try again
        </button>
        <Link
          href="/blog"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          All articles
        </Link>
      </div>
      {process.env.NODE_ENV === "development" ? (
        <pre className="mt-8 overflow-auto rounded-lg bg-zinc-100 p-4 text-left text-xs text-red-800">{error.message}</pre>
      ) : null}
    </div>
  );
}
