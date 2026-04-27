import Link from "next/link";

/** Placeholder until Phase 2B customer recurring UI — keeps email links from 404ing. */
export default function AccountRecurringPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Recurring cleaning</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Plans now run on <span className="font-medium">recurring_bookings</span>. A full dashboard for pause, skip, and
        next visit is coming soon.
      </p>
      <Link
        href="/dashboard/bookings"
        className="mt-6 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      >
        View bookings →
      </Link>
    </div>
  );
}
