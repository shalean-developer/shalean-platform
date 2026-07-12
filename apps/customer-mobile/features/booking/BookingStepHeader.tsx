import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { ProgressBar } from "@shalean/mobile-ui";
import { homeColors } from "@/features/home/homeTheme";
import { AppText, touchTarget } from "@/theme";
import { BOOKING_STEP_LABELS } from "@/lib/booking/serviceMeta";

type Props = {
  step: 1 | 2 | 3 | 4;
  title: string;
  subtitle?: string;
};

export function BookingStepHeader({ step, title, subtitle }: Props) {
  const router = useRouter();
  const progress = (step / 4) * 100;

  return (
    <View style={{ marginBottom: 14, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={{
            width: touchTarget,
            height: touchTarget,
            borderRadius: touchTarget / 2,
            backgroundColor: homeColors.card,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <Feather name="chevron-left" size={22} color={homeColors.ink} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="label" style={{ color: homeColors.primary, letterSpacing: 0.2 }}>
            Step {step} of 4 · {BOOKING_STEP_LABELS[step - 1]}
          </AppText>
          <AppText
            variant="title"
            style={{ color: homeColors.ink, letterSpacing: -0.3, marginTop: 2 }}
            numberOfLines={1}
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText
              variant="secondary"
              style={{ color: homeColors.muted, marginTop: 2 }}
              numberOfLines={1}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
      </View>

      <ProgressBar
        value={progress}
        height={6}
        accessibilityLabel={`Booking step ${step} of 4`}
      />
    </View>
  );
}
