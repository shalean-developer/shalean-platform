import { Pressable, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { formatZar } from "@/lib/booking/displayPricing";
import type { LiveExtra } from "@/services/types/bookingV2";
import { AppText, colors } from "@/theme";

type Props = {
  extras: LiveExtra[];
  selected: string[];
  onToggle: (id: string) => void;
};

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Icons for known extra ids only — unknown ids get a generic fallback. */
const EXTRA_ICONS: Record<string, IconName> = {
  inside_fridge: "fridge-outline",
  inside_oven: "stove",
  inside_cabinets: "cupboard-outline",
  interior_windows: "window-closed-variant",
  interior_walls: "wall",
  ironing_laundry: "iron-outline",
  ironing: "iron-outline",
  laundry: "washing-machine",
  balcony: "balcony",
  carpet_clean: "rug",
  ceiling_clean: "ceiling-light",
  garage_clean: "garage",
  mattress_clean: "bed-outline",
  outside_windows: "window-open-variant",
  water_plants: "flower-outline",
  small_appliances: "toaster-oven",
};

function iconForExtra(id: string): IconName {
  return EXTRA_ICONS[id] ?? "broom";
}

export function ExtrasPicker({ extras, selected, onToggle }: Props) {
  if (!extras.length) return null;

  return (
    <View>
      <AppText variant="secondary" className="mb-3 font-semibold text-ink">
        Extras
      </AppText>
      <View className="flex-row flex-wrap justify-between gap-y-4">
        {extras.map((extra) => {
          const on = selected.includes(extra.id);
          const icon = iconForExtra(extra.id);
          return (
            <Pressable
              key={extra.id}
              onPress={() => onToggle(extra.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${extra.label}, ${formatZar(extra.priceZar)}`}
              className="w-[30%] items-center active:opacity-70"
            >
              <View
                className={`mb-1.5 h-14 w-14 items-center justify-center rounded-full border-2 ${
                  on ? "border-brand-500 bg-brand-50" : "border-brand-200 bg-surface-card"
                }`}
              >
                <MaterialCommunityIcons
                  name={icon}
                  size={26}
                  color={on ? colors.brand[600] : colors.brand[500]}
                />
              </View>
              <AppText
                variant="label"
                className={`text-center font-medium ${on ? "text-brand-700" : "text-ink"}`}
                numberOfLines={2}
              >
                {extra.label}
              </AppText>
              <AppText
                variant="label"
                className={`mt-0.5 text-center font-semibold ${
                  on ? "text-brand-600" : "text-ink-muted"
                }`}
              >
                {formatZar(extra.priceZar)}
              </AppText>
            </Pressable>
          );
        })}
        {/* Keep last row left-aligned when count % 3 !== 0 */}
        {extras.length % 3 === 1 ? (
          <>
            <View className="w-[30%]" />
            <View className="w-[30%]" />
          </>
        ) : null}
        {extras.length % 3 === 2 ? <View className="w-[30%]" /> : null}
      </View>
    </View>
  );
}
