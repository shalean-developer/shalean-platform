import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildBookHrefFromLegacySearchParams } from "@/lib/booking/legacyBookingToBookRedirect";
import { collectLegacyBookingSearchParams } from "@/lib/booking/legacyBookingSearchParams";
import { noIndexFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexFollowCanonical("/booking/schedule");

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;
  redirect(buildBookHrefFromLegacySearchParams(collectLegacyBookingSearchParams(sp), "schedule"));
}
