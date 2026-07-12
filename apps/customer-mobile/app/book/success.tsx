import { View, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppButton, Screen, SectionCard } from "@shalean/mobile-ui";
import { usePaystackFinalize } from "@/features/payment/usePaystackFinalize";
import type { PaymentFinalizePhase } from "@/features/payment/types";
import { formatZar } from "@/lib/booking/displayPricing";
import {
  buildCustomerReferralInviteUrl,
  buildReferralShareMessage,
} from "@/lib/rewards/customerReferralInvite";
import { useReferralsMe } from "@/hooks/useCustomerRewards";
import { useAuth } from "@/providers/AuthProvider";
import { AppText } from "@/theme";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

export default function BookingSuccessScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const referralsQuery = useReferralsMe();
  const params = useLocalSearchParams<{
    reference?: string;
    trxref?: string;
    bookingId?: string;
    amount?: string;
    payAmount?: string;
    phase?: string;
    email?: string;
  }>();

  const reference = firstParam(params.reference) || firstParam(params.trxref);
  const paramBookingId = firstParam(params.bookingId);
  const amountRaw = firstParam(params.amount) || firstParam(params.payAmount);
  const amount = Number(amountRaw);
  const amountLabel = Number.isFinite(amount) && amount > 0 ? formatZar(amount) : null;
  const email = firstParam(params.email) || (profile?.email ?? "").trim();

  const initialPhase = firstParam(params.phase) as PaymentFinalizePhase | "";
  const skipFinalize = initialPhase === "cancelled" && !reference;

  const { phase, errorMessage, bookingId, bookingReference, retry } = usePaystackFinalize(
    skipFinalize ? null : reference || null,
  );

  const effectivePhase: PaymentFinalizePhase = skipFinalize
    ? "cancelled"
    : !reference
      ? "failed"
      : phase;

  const displayBookingId = bookingId || paramBookingId || bookingReference || null;
  const bookingSnippet = displayBookingId
    ? displayBookingId.length > 12
      ? `${displayBookingId.slice(0, 12)}…`
      : displayBookingId
    : "—";

  function goRetryPay() {
    if (!paramBookingId || !reference) return;
    router.replace({
      pathname: "/book/pay",
      params: {
        bookingId: paramBookingId,
        reference,
        amount: amountRaw,
        email,
      },
    });
  }

  return (
    <Screen scroll edges={["top", "bottom"]} contentClassName="px-4 pb-10 pt-6">
      {effectivePhase === "finalizing" ? (
        <>
          <AppText variant="label" className="font-medium tracking-wide text-brand-600">
            Payment
          </AppText>
          <AppText variant="title" className="mb-2 text-ink">
            Confirming…
          </AppText>
          <AppText variant="body" className="mb-6 text-ink-muted">
            This usually takes a few seconds. Do not close the app.
          </AppText>
          <SectionCard>
            <AppText variant="body" className="text-ink-muted">
              Verifying your Paystack payment…
            </AppText>
          </SectionCard>
        </>
      ) : null}

      {effectivePhase === "success" ? (
        <>
          <AppText variant="label" className="font-medium tracking-wide text-brand-600">
            Payment received
          </AppText>
          <AppText variant="title" className="mb-2 text-ink">
            You’re booked
          </AppText>
          <AppText variant="body" className="mb-6 text-ink-muted">
            Your payment went through and your booking is confirmed.
          </AppText>
          <SectionCard className="mb-6">
            <AppText variant="secondary" className="text-ink-muted">
              Booking
            </AppText>
            <AppText variant="body" className="mt-1 font-semibold text-ink" selectable>
              {bookingSnippet}
            </AppText>
            {amountLabel ? (
              <>
                <AppText variant="secondary" className="mt-4 text-ink-muted">
                  Paid
                </AppText>
                <AppText variant="title" className="mt-1 font-semibold text-ink">
                  {amountLabel}
                </AppText>
              </>
            ) : null}
          </SectionCard>
          {referralsQuery.data?.referralCode ? (
            <SectionCard title="Share & earn" className="mb-6">
              <AppText variant="body" className="text-ink-muted">
                Invite a friend with your code{" "}
                <AppText variant="body" className="font-mono font-semibold text-ink">
                  {referralsQuery.data.referralCode}
                </AppText>
                .
              </AppText>
              <View className="mt-3">
                <AppButton
                  label="Share referral"
                  variant="secondary"
                  onPress={() => {
                    const url = buildCustomerReferralInviteUrl(referralsQuery.data!.referralCode);
                    void Share.share({
                      message: buildReferralShareMessage(url),
                      url,
                      title: "Shalean referral",
                    }).catch(() => undefined);
                  }}
                />
              </View>
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {effectivePhase === "persist_pending" ? (
        <>
          <AppText variant="label" className="font-medium tracking-wide text-brand-600">
            Payment received
          </AppText>
          <AppText variant="title" className="mb-2 text-ink">
            Saving your booking…
          </AppText>
          <AppText variant="body" className="mb-6 text-ink-muted">
            Your payment went through. We are saving your booking now — you do not need to pay
            again. This can take a moment while our systems catch up.
          </AppText>
          <SectionCard className="mb-6">
            <AppText variant="secondary" className="text-ink-muted">
              Reference
            </AppText>
            <AppText variant="body" className="mt-1 font-semibold text-ink" selectable>
              {reference || "—"}
            </AppText>
            {amountLabel ? (
              <>
                <AppText variant="secondary" className="mt-4 text-ink-muted">
                  Amount
                </AppText>
                <AppText variant="title" className="mt-1 font-semibold text-ink">
                  {amountLabel}
                </AppText>
              </>
            ) : null}
          </SectionCard>
          <View className="mb-3 gap-3">
            <AppButton label="Check again" onPress={() => void retry()} />
          </View>
        </>
      ) : null}

      {effectivePhase === "needs_retry" ? (
        <>
          <AppText variant="label" className="font-medium tracking-wide text-brand-600">
            Still confirming
          </AppText>
          <AppText variant="title" className="mb-2 text-ink">
            Couldn’t finish yet
          </AppText>
          <AppText variant="body" className="mb-6 text-ink-muted">
            {errorMessage ??
              "We couldn’t finish saving your booking yet. You can retry verification — if you already paid, you won’t be charged again."}
          </AppText>
          <View className="mb-3 gap-3">
            <AppButton label="Retry verify" onPress={() => void retry()} />
            {paramBookingId && reference ? (
              <AppButton label="Retry pay" variant="secondary" onPress={goRetryPay} />
            ) : null}
          </View>
        </>
      ) : null}

      {effectivePhase === "failed" ? (
        <>
          <AppText variant="label" className="font-medium tracking-wide text-brand-600">
            Payment
          </AppText>
          <AppText variant="title" className="mb-2 text-ink">
            Payment failed
          </AppText>
          <AppText variant="body" className="mb-6 text-ink-muted">
            {errorMessage ??
              (!reference
                ? "Open this screen from payment confirmation, or pay from Bookings."
                : "We couldn’t confirm this payment.")}
          </AppText>
          <View className="mb-3 gap-3">
            {reference ? (
              <AppButton label="Retry verify" onPress={() => void retry()} />
            ) : null}
            {paramBookingId && reference ? (
              <AppButton label="Retry pay" variant="secondary" onPress={goRetryPay} />
            ) : null}
          </View>
        </>
      ) : null}

      {effectivePhase === "cancelled" ? (
        <>
          <AppText variant="label" className="font-medium tracking-wide text-brand-600">
            Payment
          </AppText>
          <AppText variant="title" className="mb-2 text-ink">
            Payment cancelled
          </AppText>
          <AppText variant="body" className="mb-6 text-ink-muted">
            Payment cancelled. Booking saved — retry when you’re ready.
          </AppText>
        </>
      ) : null}

      <View className="mt-2 gap-3">
        <AppButton
          label="View bookings"
          variant={effectivePhase === "success" ? "primary" : "secondary"}
          onPress={() => router.replace("/(tabs)/bookings")}
        />
        <AppButton
          label="Back to home"
          variant="ghost"
          onPress={() => router.replace("/(tabs)/home")}
        />
      </View>
    </Screen>
  );
}
