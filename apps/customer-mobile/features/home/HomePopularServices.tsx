import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import { HomeServiceThumb } from "@/features/home/HomeServiceThumb";
import { formatZar } from "@/lib/booking/displayPricing";
import type { ServiceSlug } from "@/lib/booking/serviceMeta";
import { AppText } from "@/theme";

export type PopularServiceItem = {
  slug: ServiceSlug;
  title: string;
  priceZar: number | null;
  icon: keyof typeof Feather.glyphMap;
  rating?: string;
};

type Props = {
  services: PopularServiceItem[];
  onViewAll?: () => void;
};

export function HomePopularServices({ services, onViewAll }: Props) {
  const router = useRouter();

  return (
    <View style={{ marginBottom: 8 }}>
      <View className="mb-3 flex-row items-center justify-between px-0.5">
        <AppText variant="card" style={{ color: homeColors.ink, fontWeight: "700" }}>
          Popular services
        </AppText>
        {onViewAll ? (
          <Pressable onPress={onViewAll} accessibilityRole="button">
            <AppText variant="secondary" style={{ color: homeColors.muted, fontWeight: "500" }}>
              View All
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: 12 }}>
        {services.map((service) => {
          const open = () => router.push(`/book/${service.slug}/details` as never);
          return (
            <View
              key={service.slug}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: homeColors.card,
                borderRadius: 20,
                padding: 12,
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
                gap: 12,
              }}
            >
              <Pressable
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={service.title}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flex: 1,
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <HomeServiceThumb size={78} height={88} borderRadius={18} fit="contain" />

                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText
                    variant="body"
                    numberOfLines={1}
                    style={{ color: homeColors.ink, fontWeight: "700" }}
                  >
                    {service.title}
                  </AppText>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 }}
                  >
                    <Feather name="star" size={12} color={homeColors.star} />
                    <AppText variant="label" style={{ color: homeColors.ink, fontWeight: "600" }}>
                      {service.rating ?? "4.9"}
                    </AppText>
                    <AppText variant="label" style={{ color: homeColors.muted }}>
                      Verified
                    </AppText>
                  </View>
                  <AppText
                    variant="secondary"
                    style={{
                      color: homeColors.primaryLight,
                      fontWeight: "600",
                      marginTop: 4,
                    }}
                  >
                    {service.priceZar != null
                      ? `Starting ${formatZar(service.priceZar)}`
                      : "Get a quote"}
                  </AppText>
                </View>
              </Pressable>

              <Pressable
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={`Book ${service.title} now`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  backgroundColor: homeColors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                }}
              >
                <Feather name="calendar" size={13} color="#FFFFFF" />
                <AppText variant="label" style={{ color: "#FFFFFF", fontWeight: "700" }}>
                  Book Now
                </AppText>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
