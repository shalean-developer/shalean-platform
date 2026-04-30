import { Star } from "lucide-react";
import type { CleanerMobileProfile } from "@/lib/cleaner/cleanerProfileTypes";

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "";
    const b = parts[parts.length - 1]![0] ?? "";
    return `${a}${b}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export default function ProfileHeader({ profile }: { profile: CleanerMobileProfile }) {
  const tel = profile.phone.replace(/\s/g, "");
  const initials = initialsFromName(profile.name);
  const jobs = profile.jobsCompleted ?? 0;

  return (
    <section className="flex gap-4">
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold tracking-tight text-white shadow-md shadow-blue-900/15 dark:bg-blue-500"
        aria-hidden
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{profile.name}</h1>
        {tel ? (
          <a
            href={`tel:${tel}`}
            className="mt-1 block text-base font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            {profile.phone}
          </a>
        ) : (
          <p className="mt-1 text-base text-zinc-500">—</p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
              {profile.rating.toFixed(1)}
            </span>
            <span>rating</span>
          </span>
          {jobs > 0 ? (
            <>
              <span className="text-zinc-400" aria-hidden>
                •
              </span>
              <span>
                {jobs} {jobs === 1 ? "job" : "jobs"} completed
              </span>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
