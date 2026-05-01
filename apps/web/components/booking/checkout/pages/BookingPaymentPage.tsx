"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import { CustomerDetailsStep } from "@/components/booking/steps/CustomerDetailsStep";
import { Button } from "@/components/ui/button";
import { validateCustomerDetails } from "@/lib/booking/customerDetailsValidation";
import { submitBooking } from "@/lib/booking/submitBooking";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { validateCheckoutStoreForPayment } from "@/lib/booking/reconcileBookingState";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";

export function BookingPaymentPage() {
  const router = useRouter();
  const { data: catalog, loading: catalogLoading } = usePricingCatalog();
  const snapshot = catalog?.snapshot ?? null;

  const customerName = useBookingCheckoutStore((s) => s.customerName);
  const customerEmail = useBookingCheckoutStore((s) => s.customerEmail);
  const customerPhone = useBookingCheckoutStore((s) => s.customerPhone);
  const patch = useBookingCheckoutStore((s) => s.patch);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pricingLoading = catalogLoading || !snapshot;

  const pay = useCallback(async () => {
    setError(null);
    const s = useBookingCheckoutStore.getState();
    try {
      validateCheckoutStoreForPayment(s);
      console.log("[BOOKING STATE VALIDATED]", { step: "payment", valid: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Incomplete booking";
      setError(msg);
      router.push("/booking/details");
      return;
    }
    const v = validateCustomerDetails({
      customerName: s.customerName,
      customerEmail: s.customerEmail,
      customerPhone: s.customerPhone,
    });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setBusy(true);
    const r = await submitBooking({
      service: s.service,
      bedrooms: s.bedrooms,
      bathrooms: s.bathrooms,
      extraRooms: s.extraRooms,
      extras: s.extras,
      date: s.date,
      time: s.time,
      location: s.location,
      locationSlug: s.locationSlug,
      serviceAreaLocationId: s.serviceAreaLocationId,
      serviceAreaCityId: s.serviceAreaCityId,
      serviceAreaName: s.serviceAreaName,
      cleanerId: s.cleanerId,
      customerName: s.customerName,
      customerEmail: s.customerEmail,
      customerPhone: s.customerPhone,
    });
    setBusy(false);
    if (r.success) {
      router.push(`/payment/${r.bookingId}`);
      return;
    }
    setError(r.error);
  }, [router]);

  return (
    <div className="space-y-6 lg:space-y-8">
      <BookingSectionCard eyebrow="Your details">
        <CustomerDetailsStep
          customerName={customerName}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          onChange={(p) => patch(p)}
        />
      </BookingSectionCard>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="hidden border-t border-gray-100 pt-6 dark:border-zinc-800 lg:block">
        <Button
          type="button"
          size="xl"
          className="w-full rounded-xl font-semibold shadow-sm transition-all duration-200"
          disabled={busy || pricingLoading}
          onClick={() => void pay()}
        >
          {busy ? "Creating booking…" : "Pay & confirm"}
        </Button>
        <p className="mt-3 text-center text-xs text-gray-500 dark:text-zinc-400">Secure checkout on the next screen.</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-100 bg-white/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Button
            type="button"
            size="xl"
            className="w-full rounded-xl font-semibold shadow-sm transition-all duration-200"
            disabled={busy || pricingLoading}
            onClick={() => void pay()}
          >
            {busy ? "…" : "Pay & confirm"}
          </Button>
        </div>
      </div>

      <div className="h-24 lg:hidden" aria-hidden />
    </div>
  );
}
