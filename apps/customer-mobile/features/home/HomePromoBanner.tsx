import { Image, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import { HOME_HERO_IMAGE } from "@/features/home/HomeServiceThumb";
import { AppText } from "@/theme";

type Props = {
  onBookPress?: () => void;
};

export function HomePromoBanner({ onBookPress }: Props) {
  const router = useRouter();

  const book = () => {
    if (onBookPress) {
      onBookPress();
      return;
    }
    router.push("/book/regular-cleaning/details" as never);
  };

  return (
    <View
      style={{
        marginBottom: 22,
        borderRadius: 24,
        backgroundColor: homeColors.primary,
        overflow: "hidden",
        height: 168,
        flexDirection: "row",
      }}
    >
      <View
        style={{
          flex: 1.2,
          paddingVertical: 16,
          paddingLeft: 18,
          paddingRight: 8,
          justifyContent: "space-between",
          zIndex: 2,
        }}
      >
        <View
          style={{
            alignSelf: "flex-start",
            backgroundColor: "rgba(255,255,255,0.22)",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
          }}
        >
          <AppText variant="label" style={{ color: "#DBEAFE", fontWeight: "600" }}>
            Limited offer
          </AppText>
        </View>

        <AppText
          variant="title"
          style={{
            color: "#FFFFFF",
            fontWeight: "800",
            maxWidth: 150,
          }}
        >
          Smart Home{"\n"}Service
        </AppText>

        <Pressable
          onPress={book}
          accessibilityRole="button"
          accessibilityLabel="Book now"
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: "#FFFFFF",
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
          }}
        >
          <Feather name="calendar" size={14} color={homeColors.primary} />
          <AppText variant="secondary" style={{ color: homeColors.primary, fontWeight: "700" }}>
            Book Now
          </AppText>
        </Pressable>
      </View>

      <View
        style={{
          width: 150,
          height: "100%",
          position: "relative",
          overflow: "hidden",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        {/* Discount badge */}
        <View
          style={{
            position: "absolute",
            left: 4,
            top: "36%",
            zIndex: 3,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 3,
            borderColor: homeColors.primaryMuted,
            transform: [{ rotate: "-8deg" }],
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 4,
          }}
        >
          <AppText variant="label" style={{ color: homeColors.primary, fontWeight: "800" }}>
            30%
          </AppText>
          <AppText variant="label" style={{ color: homeColors.primary, fontWeight: "700" }}>
            OFF
          </AppText>
        </View>

        <Image
          source={HOME_HERO_IMAGE}
          style={{
            width: 148,
            height: 168,
          }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        {/* Soft fade into blue so portrait blends with banner */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 28,
            backgroundColor: homeColors.primary,
            opacity: 0.28,
          }}
        />
      </View>
    </View>
  );
}
