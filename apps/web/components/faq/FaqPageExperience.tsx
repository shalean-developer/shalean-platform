"use client";

import { useMemo, useState } from "react";
import { FAQGroup } from "@/components/faq/FAQGroup";
import { FAQSearch } from "@/components/faq/FAQSearch";
import { FaqFeaturedPanel } from "@/components/faq/FaqFeaturedPanel";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { FAQ_CATEGORY_GROUPS, FAQ_FEATURED } from "@/lib/faq/faq-page-data";
import type { FaqCategoryGroup, FaqStructuredItem } from "@/lib/faq/faq-page-types";

function matchesItem(item: FaqStructuredItem, needle: string): boolean {
  if (!needle) return true;
  const blob = [
    item.question,
    item.lead,
    ...(item.paragraphs ?? []),
    ...(item.bullets ?? []),
    ...(item.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(needle);
}

export function FaqPageExperience() {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const featuredFiltered = useMemo(
    () => FAQ_FEATURED.filter((item) => matchesItem(item, needle)),
    [needle],
  );

  const groupsFiltered: FaqCategoryGroup[] = useMemo(
    () =>
      FAQ_CATEGORY_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => matchesItem(item, needle)),
      })).filter((g) => g.items.length > 0),
    [needle],
  );

  const hasAny = featuredFiltered.length > 0 || groupsFiltered.length > 0;

  return (
    <div className="pb-24 md:pb-0">
      <PublicPageContainer className="py-10" aria-label="Search FAQs">
        <FAQSearch value={query} onChange={setQuery} />
      </PublicPageContainer>

      {!hasAny ? (
        <PublicPageContainer className="pb-16">
          <div className="rounded-[var(--ui-radius-2xl)] border border-border bg-muted px-5 py-6 text-center">
            <p className="text-sm text-muted-foreground sm:text-base">
              No matching questions—try &ldquo;price&rdquo;, &ldquo;supplies&rdquo;, or &ldquo;same-day&rdquo;.
            </p>
            <button
              type="button"
              className="mt-4 text-sm font-semibold text-blue-800 underline-offset-4 hover:underline"
              onClick={() => setQuery("")}
            >
              Clear search
            </button>
          </div>
        </PublicPageContainer>
      ) : null}

      {featuredFiltered.length > 0 ? (
        <PublicPageContainer className="pb-14" aria-labelledby="faq-featured-heading">
          <h2 id="faq-featured-heading" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Popular answers
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Straight responses first—then detail—so you can decide fast.
          </p>
          <ul className="mt-8 grid gap-5 lg:grid-cols-2">
            {featuredFiltered.map((item) => (
              <li key={item.id}>
                <FaqFeaturedPanel item={item} />
              </li>
            ))}
          </ul>
        </PublicPageContainer>
      ) : null}

      {groupsFiltered.length > 0 ? (
        <PublicPageContainer className="space-y-14 pb-16" aria-label="FAQ categories">
          {needle ? (
            <p className="text-sm font-medium text-blue-800">
              Showing {groupsFiltered.reduce((n, g) => n + g.items.length, 0)} matching questions in categories below.
            </p>
          ) : null}
          {groupsFiltered.map((group) => (
            <FAQGroup key={group.id} group={group} />
          ))}
        </PublicPageContainer>
      ) : null}
    </div>
  );
}
