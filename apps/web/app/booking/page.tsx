import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { legacyFlowStepQueryToBookHref } from "@/lib/booking/legacyBookingToBookRedirect";
import { collectLegacyBookingSearchParams } from "@/lib/booking/legacyBookingSearchParams";
import { noIndexFollowCanonical } from "@/lib/site/transactionalMetadata";

export const metadata: Metadata = noIndexFollowCanonical("/booking");

type BookingIndexPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookingIndexPage({ searchParams }: BookingIndexPageProps) {
  const sp = await searchParams;
  const params = collectLegacyBookingSearchParams(sp);
  const step = params.get("step");
  params.delete("step");
  redirect(legacyFlowStepQueryToBookHref(step, params));
}
