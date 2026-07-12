import { View } from "react-native";
import { SoftCard } from "@/features/shared/SoftUi";
import { homeColors } from "@/features/home/homeTheme";
import { formatZar } from "@/lib/booking/displayPricing";
import type { CustomerPricingBreakdown } from "@/services/types/bookingV2";
import { AppText } from "@/theme";

type Props = {
  pricing: CustomerPricingBreakdown | null | undefined;
  compact?: boolean;
  promoDiscountZar?: number;
  referralDiscountZar?: number;
  creditZar?: number;
  payTotal?: number;
};

export function PriceBreakdownCard({
  pricing,
  compact,
  promoDiscountZar = 0,
  referralDiscountZar = 0,
  creditZar = 0,
  payTotal,
}: Props) {
  if (!pricing) return null;
  const total = pricing.estimated_total ?? pricing.total ?? 0;
  const lines = pricing.lineItems ?? [];

  return (
    <SoftCard title={compact ? undefined : "Price estimate"}>
      {!compact &&
        lines.map((line, idx) => (
          <View
            key={`${line.label}-${idx}`}
            style={{
              marginBottom: 6,
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <AppText variant="secondary" style={{ flex: 1, color: homeColors.muted }}>
              {line.label}
            </AppText>
            <AppText variant="secondary" style={{ color: homeColors.ink, fontWeight: "600" }}>
              {line.amountZar < 0
                ? `− ${formatZar(Math.abs(line.amountZar))}`
                : formatZar(line.amountZar)}
            </AppText>
          </View>
        ))}
      {promoDiscountZar > 0 ? (
        <View
          style={{
            marginBottom: 6,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <AppText variant="secondary" style={{ color: "#166534" }}>
            Promotion
          </AppText>
          <AppText variant="secondary" style={{ color: "#166534", fontWeight: "600" }}>
            − {formatZar(promoDiscountZar)}
          </AppText>
        </View>
      ) : null}
      {referralDiscountZar > 0 ? (
        <View
          style={{
            marginBottom: 6,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <AppText variant="secondary" style={{ color: "#166534" }}>
            Referral discount
          </AppText>
          <AppText variant="secondary" style={{ color: "#166534", fontWeight: "600" }}>
            − {formatZar(referralDiscountZar)}
          </AppText>
        </View>
      ) : null}
      {creditZar > 0 ? (
        <View
          style={{
            marginBottom: 6,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <AppText variant="secondary" style={{ color: "#166534" }}>
            Cleaning credit
          </AppText>
          <AppText variant="secondary" style={{ color: "#166534", fontWeight: "600" }}>
            − {formatZar(creditZar)}
          </AppText>
        </View>
      ) : null}
      <View
        style={{
          marginTop: compact || lines.length === 0 ? 0 : 8,
          paddingTop: compact || lines.length === 0 ? 0 : 10,
          borderTopWidth: compact || lines.length === 0 ? 0 : 1,
          borderTopColor: "#EEF1F4",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <AppText variant="body" style={{ color: homeColors.ink, fontWeight: "700" }}>
          {payTotal != null ? "Amount due" : "Estimated total"}
        </AppText>
        <AppText variant="card" style={{ color: homeColors.primary, fontWeight: "800" }}>
          {formatZar(payTotal != null ? payTotal : total)}
        </AppText>
      </View>
      <AppText variant="label" style={{ color: homeColors.muted, marginTop: 6 }}>
        Final amount is confirmed by the server. Soft estimate only.
      </AppText>
    </SoftCard>
  );
}
