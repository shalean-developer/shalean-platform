"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CTAButton } from "@/components/ui/CTAButton";
import { trackSeoServiceCardClick } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";

type Props = {
  /** Rendered on the server as `<Icon … />` so we never pass component constructors across the RSC boundary. */
  icon: ReactNode;
  title: string;
  description: string;
  learnMoreHref: string;
  bookHref?: string;
  bookSource?: string;
  className?: string;
  /** Emit `seo_service_card_click` for learn-more + book actions. */
  seoHubTrack?: boolean;
};

export function ServiceCard({
  icon,
  title,
  description,
  learnMoreHref,
  bookHref = "/book",
  bookSource,
  className,
  seoHubTrack,
}: Props) {
  const isWindowCleaningGuide = learnMoreHref.endsWith("/window-cleaning-cape-town");

  if (isWindowCleaningGuide) {
    return (
      <aside
        className={cn(
          "sm:col-span-2 lg:col-span-3 flex flex-col gap-[var(--ui-space-6)] rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-[#EFF6FF] p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)] md:flex-row md:items-center md:justify-between md:p-[var(--ui-space-8)]",
          className,
        )}
        aria-label="Window Cleaning guide"
      >
        <div className="flex items-start gap-[var(--ui-space-4)]">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-[var(--ui-shadow-sm)] ring-1 ring-[#DBEAFE]">
            {icon}
          </div>
          <div>
            <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">
              Specialist add-on guide
            </p>
            <h3 className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
              {title}
            </h3>
            <p className="mt-[var(--ui-space-2)] max-w-2xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <Link
          href={learnMoreHref}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => {
            if (seoHubTrack) {
              trackSeoServiceCardClick({
                click_type: "learn_more",
                service_name: title,
                surface: "services_hub",
                href: learnMoreHref,
              });
            }
          }}
        >
          View guide
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </aside>
    );
  }

  return (
    <article
      className={cn(
        "flex min-h-[360px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-card p-[var(--ui-space-7)] text-card-foreground shadow-[var(--ui-shadow-md)] transition duration-200 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[var(--ui-shadow-lg)]",
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EFF6FF] text-primary">
        {icon}
      </div>
      <h3 className="mt-[var(--ui-space-5)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-[var(--ui-space-3)] flex-1 text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
        {description}
      </p>
      <div className="mt-[var(--ui-space-7)] flex flex-wrap items-center gap-[var(--ui-space-3)]">
        <CTAButton
          href={bookHref}
          variant="primary"
          trackSource={bookSource}
          seoHubCta={
            seoHubTrack
              ? { cta_location: "service_card", cta_label: `Book — ${title}`, cta_kind: "book_now" }
              : undefined
          }
          seoHubServiceCardBook={seoHubTrack ? { service_name: title } : undefined}
          className="min-h-12 px-[var(--ui-space-5)]"
        >
          Book now
        </CTAButton>
        <Link
          href={learnMoreHref}
          className="group inline-flex min-h-12 items-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-pill)] px-[var(--ui-space-3)] text-[length:var(--ui-text-small)] font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            if (seoHubTrack) {
              trackSeoServiceCardClick({
                click_type: "learn_more",
                service_name: title,
                surface: "services_hub",
                href: learnMoreHref,
              });
            }
          }}
        >
          Learn more
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
