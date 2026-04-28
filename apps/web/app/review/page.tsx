import { Suspense } from "react";
import BookingContainer from "@/components/layout/BookingContainer";
import { PublicReviewForm } from "@/components/review/PublicReviewForm";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ booking?: string }> };

export default async function ReviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const bookingId = typeof sp.booking === "string" ? sp.booking.trim() : "";

  return (
    <BookingContainer className="py-12 sm:py-16">
      <Suspense
        fallback={
          <div className="mx-auto max-w-lg text-center">
            <p className="text-sm text-zinc-500">Loading…</p>
          </div>
        }
      >
        <PublicReviewForm initialBookingId={bookingId} />
      </Suspense>
    </BookingContainer>
  );
}
