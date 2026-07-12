import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppButton, Screen, SectionCard } from "@shalean/mobile-ui";
import { PaystackWebView } from "@/features/payment/PaystackWebView";
import type { PaystackWebViewMessage } from "@/features/payment/types";
import { formatZar } from "@/lib/booking/displayPricing";
import { API_UPSTREAM_URL } from "@/constants/config";
import { CUSTOMER_ANALYTICS_EVENTS } from "@/lib/analytics/customerAnalyticsEvents";
import { trackCustomerEvent } from "@/lib/analytics/trackCustomerEvent";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import {
  paystackKeyLooksMismatchedForApi,
  resolvePaystackPublicKey,
  setServerPaystackPublicKey,
} from "@/lib/payment/paystackPublicKey";
import { resolveCustomerContactEmail } from "@/lib/booking/prefillFromCustomerProfile";
import { useCustomerProfile } from "@/hooks/useCustomerAccount";
import { useAuth } from "@/providers/AuthProvider";
import { getPaystackApi } from "@/services/customerApi";
import { AppText } from "@/theme";

type PrecheckState =
  | { status: "idle" | "checking" }
  | { status: "ready" }
  | { status: "error"; message: string };

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? "").trim();
  return (value ?? "").trim();
}

export default function BookingPayScreen() {
  const router = useRouter();
  const { profile: authProfile } = useAuth();
  const profileQuery = useCustomerProfile();
  const params = useLocalSearchParams<{
    bookingId?: string;
    reference?: string;
    amount?: string;
    email?: string;
  }>();

  const bookingId = firstParam(params.bookingId);
  const reference = firstParam(params.reference);
  const email =
    firstParam(params.email) ||
    resolveCustomerContactEmail(profileQuery.data, authProfile?.email);
  const amountZar = Number(firstParam(params.amount));
  const amountOk = Number.isFinite(amountZar) && amountZar > 0;

  const [publicKey, setPublicKey] = useState(() => resolvePaystackPublicKey());
  const [precheck, setPrecheck] = useState<PrecheckState>({ status: "idle" });
  const [cancelled, setCancelled] = useState(false);
  const [webviewKey, setWebviewKey] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const bookingSnippet =
    bookingId.length > 8 ? `${bookingId.slice(0, 8)}…` : bookingId || "—";

  const canPay =
    Boolean(publicKey) &&
    Boolean(reference) &&
    Boolean(email) &&
    Boolean(bookingId) &&
    amountOk;

  const inlineParams = useMemo(
    () => ({
      publicKey,
      email,
      amountZar,
      reference,
      bookingId,
    }),
    [publicKey, email, amountZar, reference, bookingId],
  );

  const runPrecheck = useCallback(async () => {
    const key = resolvePaystackPublicKey();
    setPublicKey(key);

    if (!key || !reference || !email || !bookingId || !amountOk) {
      const missing: string[] = [];
      if (!key) missing.push("Paystack public key");
      if (!bookingId) missing.push("booking id");
      if (!reference) missing.push("payment reference");
      if (!email) missing.push("email (sign in again or update your profile)");
      if (!amountOk) missing.push("amount");
      setPrecheck({
        status: "error",
        message: `Missing payment details: ${missing.join(", ")}. Go back to checkout or Bookings.`,
      });
      return;
    }

    if (paystackKeyLooksMismatchedForApi(API_UPSTREAM_URL, key)) {
      setPrecheck({
        status: "error",
        message:
          "This app is using a Paystack test key against the production API. Charges won’t verify (Transaction reference not found). Use the live pk_ key that matches shalean.co.za, or point EXPO_PUBLIC_API_BASE_URL at a local server with matching test keys.",
      });
      return;
    }

    setPrecheck({ status: "checking" });
    setInlineError(null);
    try {
      const res = await getPaystackApi().paymentPrecheck<{
        ok?: boolean;
        error?: string;
        paystackPublicKey?: string;
      }>({
        bookingId,
        expectedTotalZar: amountZar,
      });
      if (!res.ok || res.data.ok !== true) {
        const message =
          (res.ok ? res.data.error : res.error)?.trim() ||
          "This checkout is no longer available. Refresh or open Bookings.";
        setPrecheck({ status: "error", message });
        return;
      }
      if (res.data.paystackPublicKey) {
        setServerPaystackPublicKey(res.data.paystackPublicKey);
        const nextKey = resolvePaystackPublicKey();
        setPublicKey(nextKey);
        if (paystackKeyLooksMismatchedForApi(API_UPSTREAM_URL, nextKey)) {
          setPrecheck({
            status: "error",
            message:
              "Paystack key still doesn’t match the API environment. Update EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY to the same mode as the server (test vs live).",
          });
          return;
        }
      }
      setPrecheck({ status: "ready" });
    } catch (e) {
      setPrecheck({
        status: "error",
        message: friendlyErrorMessage(e, "Could not verify checkout. Check your connection."),
      });
    }
  }, [reference, email, bookingId, amountOk, amountZar]);

  useEffect(() => {
    void runPrecheck();
  }, [runPrecheck]);

  useEffect(() => {
    if (precheck.status !== "ready") return;
    void trackCustomerEvent(CUSTOMER_ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED, {
      screen: "pay",
    });
    void trackCustomerEvent(CUSTOMER_ANALYTICS_EVENTS.PAYMENT_INITIATED, {
      screen: "pay",
    });
  }, [precheck.status]);

  const goSuccess = useCallback(
    (ref: string) => {
      void trackCustomerEvent(CUSTOMER_ANALYTICS_EVENTS.PAYMENT_COMPLETED, {
        screen: "pay",
        ...(bookingId ? { booking_id: bookingId } : {}),
        ...(ref ? { reference: ref } : {}),
      });
      router.replace({
        pathname: "/book/success",
        params: {
          reference: ref,
          bookingId,
          amount: String(amountZar),
          email,
        },
      });
    },
    [router, bookingId, amountZar, email],
  );

  const onWebViewMessage = useCallback(
    (message: PaystackWebViewMessage) => {
      if (message.type === "success") {
        goSuccess(message.reference || reference);
        return;
      }
      if (message.type === "cancel") {
        setCancelled(true);
        return;
      }
      if (message.type === "error") {
        setInlineError(message.message?.trim() || "Could not open Paystack.");
      }
    },
    [goSuccess, reference],
  );

  function retryPay() {
    setCancelled(false);
    setInlineError(null);
    setWebviewKey((k) => k + 1);
    void runPrecheck();
  }

  if (cancelled) {
    return (
      <Screen scroll edges={["top", "bottom"]} contentClassName="px-4 pb-10 pt-6">
        <AppText variant="label" className="font-medium tracking-wide text-brand-600">
          Payment
        </AppText>
        <AppText variant="title" className="mb-2 text-ink">
          Payment cancelled
        </AppText>
        <AppText variant="body" className="mb-6 text-ink-muted">
          Payment cancelled. Booking saved — you can retry payment anytime.
        </AppText>
        <SectionCard className="mb-6">
          <AppText variant="secondary" className="text-ink-muted">
            Booking
          </AppText>
          <AppText variant="body" className="mt-1 font-semibold text-ink" selectable>
            {bookingSnippet}
          </AppText>
          <AppText variant="secondary" className="mt-4 text-ink-muted">
            Amount due
          </AppText>
          <AppText variant="title" className="mt-1 font-semibold text-ink">
            {amountOk ? formatZar(amountZar) : "—"}
          </AppText>
        </SectionCard>
        <View className="gap-3">
          <AppButton label="Retry payment" onPress={retryPay} />
          <AppButton
            label="Go to Bookings"
            variant="secondary"
            onPress={() => router.replace("/(tabs)/bookings")}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} edges={["top", "bottom"]} contentClassName="flex-1 px-4 pt-4 pb-4">
      <AppText variant="label" className="font-medium tracking-wide text-brand-600">
        Secure checkout
      </AppText>
      <AppText variant="title" className="mb-1 text-ink">
        Pay with Paystack
      </AppText>
      <AppText variant="body" className="mb-4 text-ink-muted">
        {amountOk ? formatZar(amountZar) : "—"} · Booking {bookingSnippet}
      </AppText>

      {precheck.status === "checking" || precheck.status === "idle" ? (
        <SectionCard>
          <AppText variant="body" className="text-ink-muted">
            Checking your booking…
          </AppText>
        </SectionCard>
      ) : null}

      {precheck.status === "error" ? (
        <SectionCard className="mb-4">
          <AppText variant="body" className="text-danger">
            {precheck.message}
          </AppText>
          <View className="mt-4 gap-3">
            <AppButton label="Try again" onPress={() => void runPrecheck()} />
            <AppButton
              label="Go to Bookings"
              variant="secondary"
              onPress={() => router.replace("/(tabs)/bookings")}
            />
          </View>
        </SectionCard>
      ) : null}

      {inlineError ? (
        <AppText
          variant="secondary"
          className="mb-3 text-danger"
          accessibilityLiveRegion="polite"
        >
          {inlineError}
        </AppText>
      ) : null}

      {precheck.status === "ready" && canPay ? (
        <View className="flex-1">
          <PaystackWebView
            key={webviewKey}
            params={inlineParams}
            onMessage={onWebViewMessage}
          />
        </View>
      ) : null}
    </Screen>
  );
}
