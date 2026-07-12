import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import { AppText } from "@/theme";

type Props = {
  name: string;
  unreadCount?: number;
};

export function HomeHeader({ name, unreadCount = 0 }: Props) {
  const router = useRouter();
  const initial = name.trim().charAt(0).toUpperCase() || "S";

  return (
    <View className="mb-5 flex-row items-center justify-between">
      <View className="min-w-0 flex-1 pr-3">
        <AppText variant="secondary" style={{ color: homeColors.muted, fontWeight: "500" }}>
          Welcome back
        </AppText>
        <AppText
          variant="hero"
          style={{ color: homeColors.ink, marginTop: 2 }}
          numberOfLines={1}
        >
          Hello, {name}
        </AppText>
      </View>

      <View className="flex-row items-center gap-2.5">
        <Pressable
          onPress={() => router.push("/profile/notifications" as never)}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
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
          <Feather name="bell" size={20} color={homeColors.ink} />
          {unreadCount > 0 ? (
            <View
              style={{
                position: "absolute",
                top: 11,
                right: 12,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: homeColors.danger,
                borderWidth: 1.5,
                borderColor: homeColors.card,
              }}
            />
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => router.push("/(tabs)/profile")}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: homeColors.primary,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <AppText variant="card" style={{ color: "#FFFFFF", fontWeight: "700" }}>
            {initial}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
