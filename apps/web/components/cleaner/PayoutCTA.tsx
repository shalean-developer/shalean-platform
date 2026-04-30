"use client";

import { CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function PayoutCTA({
  hasPayoutMethod,
  summaryLine,
}: {
  hasPayoutMethod: boolean;
  summaryLine: string | null;
}) {
  const router = useRouter();

  if (hasPayoutMethod) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Payout method</p>
        <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{summaryLine ?? "Bank on file"}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11 w-full rounded-xl border-zinc-200 text-base font-medium dark:border-zinc-600"
          onClick={() => router.push("/cleaner/settings/payment")}
        >
          Update details
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-zinc-900 p-4 text-white dark:bg-zinc-950">
      <p className="font-semibold">Get paid weekly</p>
      <p className="mt-1 text-sm text-white/80">Add your bank account so we can pay you.</p>
      <Button
        type="button"
        className="mt-3 h-12 w-full rounded-xl bg-white text-base font-semibold text-zinc-900 hover:bg-zinc-100"
        onClick={() => router.push("/cleaner/settings/payment")}
      >
        <CreditCard className="h-4 w-4" aria-hidden />
        Set up payouts
      </Button>
    </section>
  );
}
