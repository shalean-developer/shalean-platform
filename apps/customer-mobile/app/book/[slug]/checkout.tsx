import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@shalean/mobile-ui";
import { SoftCard } from "@/features/shared/SoftUi";
import { homeColors } from "@/features/home/homeTheme";
import { AppText } from "@/theme";
import { PriceBreakdownCard } from "@/features/booking/components/PriceBreakdownCard";
import { BookingStepHeader } from "@/features/booking/BookingStepHeader";
import { BookingStickyFooter } from "@/features/booking/BookingStickyFooter";
import { useBookingWizard } from "@/features/booking/BookingWizardProvider";
import { buildConfirmPayload } from "@/lib/booking/buildConfirmPayload";
import { clearBookingDraft, getStoredReferralCode } from "@/lib/booking/persist";
import { formatZar } from "@/lib/booking/displayPricing";
import { setServerPaystackPublicKey } from "@/lib/payment/paystackPublicKey";
import { resolveCustomerContactEmail } from "@/lib/booking/prefillFromCustomerProfile";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useCustomerProfile } from "@/hooks/useCustomerAccount";
import { useAuth } from "@/providers/AuthProvider";
import {
  getBookingV2Api,
  getPromotionsApi,
  getReferralsApi,
} from "@/services/customerApi";
import type { ConfirmBookingResponse } from "@/services/types/bookingV2";
import { colors } from "@/theme";

type PromoState = {
  discountZar: number;
  label: string | null;
  error: string | null;
};

type ReferralState = {
  code: string;
  discountZar: number;
} | null;

export default function BookingCheckoutScreen() {
  const router = useRouter();
  const { profile: authProfile } = useAuth();
  const profileQuery = useCustomerProfile();
  const { form, liveConfig, clearDraft } = useBookingWizard();
  const contactEmail = resolveCustomerContactEmail(profileQuery.data, authProfile?.email);

  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<PromoState>({
    discountZar: 0,
    label: null,
    error: null,
  });
  const [promoChecking, setPromoChecking] = useState(false);
  const [referral, setReferral] = useState<ReferralState>(null);
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState(0);
  const [applyCredit, setApplyCredit] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseTotal =
    form.pricingSummary.estimated_total ?? form.pricingSummary.total ?? liveConfig?.basePrice ?? 0;

  const totalAfterPromo = Math.max(0, baseTotal - promo.discountZar);
  const referralToApply = referral?.discountZar ?? 0;
  const totalAfterReferral = Math.max(0, totalAfterPromo - referralToApply);
  const creditToApply = applyCredit ? Math.min(creditBalance, totalAfterReferral) : 0;
  const payTotal = Math.max(0, totalAfterReferral - creditToApply);

  const runAutoPromo = useCallback(async () => {
    const result = await getPromotionsApi().validate<{
      totalDiscountZar?: number;
      applied?: { name: string; discountZar: number; source: string }[];
    }>({
      serviceSlug: form.serviceSlug,
      selectedExtraIds: form.selectedExtras ?? [],
      subtotalZar: baseTotal,
      customerEmail: contactEmail || undefined,
      promoCode: promoCode.trim() || undefined,
    });
    if (!result.ok) return;
    const autoOnly = (result.data.applied ?? []).filter(
      (a) => a.source !== "code" || !promoCode.trim(),
    );
    const total = autoOnly.reduce((sum, a) => sum + Math.round(Number(a.discountZar ?? 0)), 0);
    if (total > 0 && autoOnly.length) {
      setPromo({
        discountZar: total,
        label: autoOnly.map((a) => a.name).join(", "),
        error: null,
      });
    } else if (!promoCode.trim()) {
      setPromo({ discountZar: 0, label: null, error: null });
    }
  }, [form.serviceSlug, form.selectedExtras, baseTotal, contactEmail, promoCode]);

  useEffect(() => {
    void runAutoPromo();
  }, [runAutoPromo]);

  useEffect(() => {
    void (async () => {
      const creditRes = await getReferralsApi().credit<{ balance?: number }>();
      if (creditRes.ok) {
        setCreditBalance(Number(creditRes.data.balance ?? 0));
      }

      const stored = await getStoredReferralCode();
      if (!stored) {
        setReferral(null);
        return;
      }
      const res = await getReferralsApi().validateCheckout<{
        valid?: boolean;
        code?: string;
        discountZar?: number;
        message?: string;
      }>({
        code: stored,
        email: contactEmail || undefined,
        bookingTotalZar: Math.max(0, baseTotal - promo.discountZar),
        serviceSlug: form.serviceSlug,
      });
      if (!res.ok) {
        setReferral(null);
        return;
      }
      if (res.data.valid && Number(res.data.discountZar) > 0) {
        setReferral({
          code: (res.data.code ?? stored).trim().toUpperCase(),
          discountZar: Math.round(Number(res.data.discountZar)),
        });
        setReferralMessage(null);
      } else {
        setReferral(null);
        setReferralMessage(res.data.message?.trim() || null);
      }
    })();
  }, [contactEmail, baseTotal, promo.discountZar, form.serviceSlug]);

  async function applyPromoCode() {
    setPromoChecking(true);
    setPromo((p) => ({ ...p, error: null }));
    try {
      const result = await getPromotionsApi().validate<{
        totalDiscountZar?: number;
        applied?: { name: string; discountZar: number }[];
        rejected?: { reason: string }[];
        error?: string;
      }>({
        serviceSlug: form.serviceSlug,
        selectedExtraIds: form.selectedExtras ?? [],
        subtotalZar: baseTotal,
        customerEmail: contactEmail || undefined,
        promoCode: promoCode.trim(),
      });
      if (!result.ok) {
        setPromo({
          discountZar: 0,
          label: null,
          error: result.error || "Could not validate code.",
        });
        return;
      }
      const total = Math.round(Number(result.data.totalDiscountZar ?? 0));
      if (total <= 0) {
        setPromo({
          discountZar: 0,
          label: null,
          error: result.data.rejected?.[0]?.reason ?? "This code is not valid for your booking.",
        });
        return;
      }
      setPromo({
        discountZar: total,
        label: (result.data.applied ?? []).map((a) => a.name).join(", ") || "Promotion applied",
        error: null,
      });
    } finally {
      setPromoChecking(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      const storedRef = referral?.code ?? (await getStoredReferralCode());
      const payload = buildConfirmPayload(form, {
        applyCleaningCreditZar: creditToApply,
        referralCode: storedRef,
        promoCode: promoCode.trim() || undefined,
      });

      const result = await getBookingV2Api().confirm<ConfirmBookingResponse>(payload);
      if (!result.ok || !result.data.success || !result.data.bookingId) {
        const message =
          (result.ok ? result.data.error : result.error) ||
          "Could not create your booking. Please try again.";
        setError(message);
        setConfirming(false);
        return;
      }

      const bookingId = result.data.bookingId;
      const payAmount = result.data.payAmountZar ?? payTotal;
      const paystackReference = (result.data.paystackReference ?? "").trim();
      const email = contactEmail;
      setServerPaystackPublicKey(result.data.paystackPublicKey);
      await clearBookingDraft();
      await clearDraft();

      const requiresPayment = result.data.requiresPayment !== false && payAmount > 0;
      if (!requiresPayment) {
        router.replace({
          pathname: "/book/success",
          params: {
            bookingId,
            ...(paystackReference ? { reference: paystackReference } : {}),
            amount: "0",
          },
        });
        return;
      }

      if (!paystackReference) {
        setError("Booking created but payment reference is missing. Open Bookings to continue.");
        setConfirming(false);
        return;
      }
      if (!email) {
        setError(
          "Your account has no email on file. Update your profile email, then open this booking from Bookings to pay.",
        );
        setConfirming(false);
        return;
      }

      router.replace({
        pathname: "/book/pay",
        params: {
          bookingId,
          reference: paystackReference,
          amount: String(payAmount),
          email,
        },
      });
    } catch (e) {
      setError(friendlyErrorMessage(e));
      setConfirming(false);
    }
  }

  return (
    <Screen
      scroll={false}
      edges={["top", "bottom"]}
      contentClassName="flex-1"
      style={{ backgroundColor: homeColors.bg }}
    >
      <View className="flex-1 px-4 pt-2">
        <BookingStepHeader step={4} title="Checkout" />
        <ScrollView className="flex-1" contentContainerClassName="pb-4" keyboardShouldPersistTaps="handled">
          <PriceBreakdownCard
            pricing={form.pricingSummary}
            promoDiscountZar={promo.discountZar}
            referralDiscountZar={referralToApply}
            creditZar={creditToApply}
            payTotal={payTotal}
            compact
          />

          <SoftCard title="Promo code" style={{ marginTop: 4 }}>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <TextInput
                  className="min-h-touch rounded-xl border border-border px-4 py-3.5 text-body text-ink"
                  style={{ backgroundColor: homeColors.bg, borderRadius: 14 }}
                  placeholder="Enter code"
                  placeholderTextColor={colors.ink.muted}
                  autoCapitalize="characters"
                  value={promoCode}
                  onChangeText={setPromoCode}
                />
              </View>
              <Pressable
                onPress={() => void applyPromoCode()}
                disabled={promoChecking || !promoCode.trim()}
                className="min-h-touch items-center justify-center rounded-xl bg-brand-500 px-4 active:opacity-80 disabled:opacity-50"
              >
                <AppText variant="button" className="text-ink-inverse">
                  {promoChecking ? "…" : "Apply"}
                </AppText>
              </Pressable>
            </View>
            {promo.error ? (
              <AppText variant="secondary" className="mt-2 text-status-warning-fg">
                {promo.error}
              </AppText>
            ) : null}
            {promo.discountZar > 0 ? (
              <AppText variant="secondary" className="mt-2 text-status-success-fg">
                {promo.label ?? "Promotion applied"} — you save {formatZar(promo.discountZar)}
              </AppText>
            ) : null}
            {referral ? (
              <AppText variant="secondary" className="mt-2 text-status-success-fg">
                Referral {referral.code}: {formatZar(referral.discountZar)} off
              </AppText>
            ) : null}
            {referralMessage ? (
              <AppText variant="secondary" className="mt-2 text-ink-muted">
                {referralMessage}
              </AppText>
            ) : null}
          </SoftCard>

          {creditBalance > 0 ? (
            <SoftCard title="Cleaning credit">
              <Pressable
                onPress={() => setApplyCredit((v) => !v)}
                className="flex-row items-center gap-3"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: applyCredit }}
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded border ${
                    applyCredit ? "border-brand-500 bg-brand-500" : "border-border"
                  }`}
                >
                  {applyCredit ? (
                    <AppText variant="label" className="font-bold text-ink-inverse">
                      ✓
                    </AppText>
                  ) : null}
                </View>
                <View className="flex-1">
                  <AppText variant="body" className="font-medium text-ink">
                    Apply credit ({formatZar(creditBalance)})
                  </AppText>
                </View>
              </Pressable>
            </SoftCard>
          ) : null}

          {error ? (
            <View className="mb-3 gap-2">
              <AppText
                variant="secondary"
                className="text-danger"
                accessibilityLiveRegion="polite"
              >
                {error}
              </AppText>
              {/no cleaners are available/i.test(error) ? (
                <Pressable
                  onPress={() =>
                    router.push(`/book/${form.serviceSlug}/schedule` as never)
                  }
                  className="self-start rounded-xl border border-brand-500 bg-brand-50 px-4 py-2.5 active:opacity-80"
                >
                  <AppText variant="secondary" className="font-semibold text-brand-700">
                    Change date or time
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <AppText variant="secondary" className="mb-2 text-ink-subtle">
            Confirming opens secure Paystack checkout for the amount due.
          </AppText>
        </ScrollView>
      </View>
      <BookingStickyFooter
        label="Confirm"
        onPress={() => void handleConfirm()}
        loading={confirming}
        disabled={confirming}
        amountZar={payTotal}
        amountLabel="Amount due"
      />
    </Screen>
  );
}
