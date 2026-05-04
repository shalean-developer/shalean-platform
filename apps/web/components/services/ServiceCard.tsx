"use client";

import type { ReactNode } from "react";
import Link from "next/link";
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
  bookHref = "/booking/details",
  bookSource,
  className,
  seoHubTrack,
}: Props) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition hover:border-zinc-300 hover:shadow-md",
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold tracking-tight text-blue-950">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">{description}</p>
      <div className="mt-6 flex flex-col gap-3">
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
          className="w-full min-h-11 rounded-xl sm:w-auto sm:self-start"
        >
          Book now
        </CTAButton>
        <Link
          href={learnMoreHref}
          className="text-sm font-semibold text-blue-900 underline decoration-blue-200 underline-offset-4 transition hover:decoration-blue-600"
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
        </Link>
      </div>
    </article>
  );
}
