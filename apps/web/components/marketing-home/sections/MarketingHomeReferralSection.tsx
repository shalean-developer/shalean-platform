import Link from "next/link";
import { ArrowRight, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MarketingHomeReferralSection() {
  return (
    <section className="border-y border-blue-100 bg-blue-50/70 py-12 sm:py-16" aria-labelledby="home-referral-title">
      <div className="mx-auto flex w-full max-w-[var(--ui-container-marketing)] flex-col gap-6 px-[var(--ui-page-gutter)] md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-2xl items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Gift className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600">Shalean Referral Program</p>
            <h2 id="home-referral-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Refer a friend. Earn Cleaning Credit.
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
              Share Shalean with someone you know. After their first cleaning is completed and fully paid,
              Cleaning Credit is added to your account.
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="shrink-0 rounded-xl">
          <Link href="/refer">
            Refer a friend
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  );
}
