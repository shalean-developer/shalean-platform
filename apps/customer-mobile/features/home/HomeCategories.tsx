import { Pressable, ScrollView, View } from "react-native";
import type { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import { HomeServiceThumb } from "@/features/home/HomeServiceThumb";
import type { ServiceSlug } from "@/lib/booking/serviceMeta";
import { AppText } from "@/theme";

export type HomeCategoryItem = {
  slug: ServiceSlug | "all";
  label: string;
  icon: keyof typeof Feather.glyphMap;
};

type Props = {
  categories: HomeCategoryItem[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
};

export function HomeCategories({ categories, selectedSlug, onSelect }: Props) {
  return (
    <View className="mb-5">
      <View className="mb-3 flex-row items-center justify-between px-0.5">
        <AppText variant="card" style={{ color: homeColors.ink, fontWeight: "700" }}>
          Services
        </AppText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingRight: 8 }}
        style={{ flexGrow: 0 }}
      >
        {categories.map((item) => {
          const active = selectedSlug === item.slug;
          return (
            <Pressable
              key={item.slug}
              onPress={() => onSelect(item.slug)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                width: 88,
                paddingVertical: 12,
                paddingHorizontal: 8,
                borderRadius: 22,
                backgroundColor: active ? homeColors.primary : homeColors.card,
                alignItems: "center",
                shadowColor: "#000",
                shadowOpacity: active ? 0.12 : 0.04,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: active ? 3 : 1,
              }}
            >
              <View style={{ marginBottom: 10 }}>
                <HomeServiceThumb
                  size={52}
                  borderRadius={26}
                  fit="contain"
                  backgroundColor={active ? "rgba(255,255,255,0.22)" : homeColors.primarySoft}
                />
              </View>
              <AppText
                variant="label"
                numberOfLines={1}
                style={{
                  color: active ? "#FFFFFF" : homeColors.muted,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
