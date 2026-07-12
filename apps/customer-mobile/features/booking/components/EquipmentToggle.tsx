import { ActivityIndicator, View } from "react-native";
import { formatZar } from "@/lib/booking/displayPricing";
import { YesNoToggle } from "@/features/booking/components/YesNoToggle";
import type { EquipmentQuoteResult } from "@/services/types/bookingV2";
import { AppText, colors } from "@/theme";

type Props = {
  required: "yes" | "no" | "";
  onChange: (value: "yes" | "no") => void;
  quote: EquipmentQuoteResult | null;
  loading: boolean;
  error: string | null;
  addressBlocked: boolean;
};

export function EquipmentToggle({
  required,
  onChange,
  quote,
  loading,
  error,
  addressBlocked,
}: Props) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <AppText variant="secondary" className="min-w-0 flex-1 font-semibold text-ink">
          Need equipment delivered?
        </AppText>
        <YesNoToggle
          value={required === "yes" ? "yes" : "no"}
          onChange={onChange}
          accessibilityLabel="Need equipment delivered"
        />
      </View>
      {required === "yes" && addressBlocked ? (
        <AppText variant="secondary" className="text-status-warning-fg">
          Enter your address and suburb to calculate the equipment fee.
        </AppText>
      ) : null}
      {required === "yes" && loading ? (
        <View className="flex-row items-center gap-2 py-2">
          <ActivityIndicator color={colors.brand[500]} size="small" />
          <AppText variant="secondary" className="text-ink-muted">
            Calculating logistics fee…
          </AppText>
        </View>
      ) : null}
      {required === "yes" && error ? (
        <AppText variant="secondary" className="text-danger">
          {error}
        </AppText>
      ) : null}
      {required === "yes" && quote?.manual_quote_required ? (
        <AppText variant="secondary" className="text-status-warning-fg">
          {quote.manual_quote_message}
          {quote.distance_km > 0 ? ` (${quote.distance_km} km)` : ""}
        </AppText>
      ) : null}
      {required === "yes" && quote && !quote.manual_quote_required && quote.logistics_fee > 0 ? (
        <AppText variant="secondary" className="text-ink-muted">
          Logistics fee {formatZar(quote.logistics_fee)} · {quote.distance_km} km from base
        </AppText>
      ) : null}
    </View>
  );
}
