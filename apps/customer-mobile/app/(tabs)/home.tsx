import { useEffect, useMemo, useState } from "react";
import { RefreshControl, Text } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { ErrorState, Screen, SectionCard } from "@shalean/mobile-ui";
import { HomeCategories, type HomeCategoryItem } from "@/features/home/HomeCategories";
import { HomeHeader } from "@/features/home/HomeHeader";
import { HomePopularServices, type PopularServiceItem } from "@/features/home/HomePopularServices";
import { HomePromoBanner } from "@/features/home/HomePromoBanner";
import { HomeSearchBar } from "@/features/home/HomeSearchBar";
import { HomeSkeleton } from "@/features/home/HomeSkeleton";
import { homeColors } from "@/features/home/homeTheme";
import { useBookingServices } from "@/features/booking/hooks/useBookingServices";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { useCustomerNotifications } from "@/hooks/useCustomerNotifications";
import { CUSTOMER_ANALYTICS_EVENTS } from "@/lib/analytics/customerAnalyticsEvents";
import { trackCustomerEvent } from "@/lib/analytics/trackCustomerEvent";
import { greetingName } from "@/lib/bookings/bookingDisplay";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { SERVICE_LABELS, type ServiceSlug } from "@/lib/booking/serviceMeta";
import { useCustomerProfile } from "@/hooks/useCustomerAccount";
import { useAuth } from "@/providers/AuthProvider";

const SERVICE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  "regular-cleaning": "home",
  "deep-cleaning": "layers",
  "moving-cleaning": "truck",
  "office-cleaning": "briefcase",
  "carpet-cleaning": "grid",
  "airbnb-cleaning": "key",
};

const CATEGORY_SHORT: Partial<Record<ServiceSlug, string>> = {
  "regular-cleaning": "Regular",
  "deep-cleaning": "Deep",
  "moving-cleaning": "Moving",
  "office-cleaning": "Office",
  "carpet-cleaning": "Carpet",
  "airbnb-cleaning": "Airbnb",
};

export default function HomeScreen() {
  const router = useRouter();
  const { profile: authProfile } = useAuth();
  const profileQuery = useCustomerProfile();
  const summaryQuery = useDashboardSummary();
  const servicesQuery = useBookingServices();
  const notificationsQuery = useCustomerNotifications();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("regular-cleaning");

  useEffect(() => {
    void trackCustomerEvent(CUSTOMER_ANALYTICS_EVENTS.PAGE_VIEW, {
      page_type: "home",
      screen: "home",
    });
  }, []);

  const customer = profileQuery.data;
  const greeting = greetingName(
    customer?.email ?? authProfile?.email,
    customer?.fullName ?? authProfile?.fullName,
  );

  const catalog = servicesQuery.data?.catalog ?? {};
  const activeSlugs = (servicesQuery.data?.activeServiceSlugs ?? []) as ServiceSlug[];

  const categories: HomeCategoryItem[] = useMemo(() => {
    const slugs =
      activeSlugs.length > 0 ? activeSlugs : (Object.keys(SERVICE_LABELS) as ServiceSlug[]);
    return slugs.map((slug) => ({
      slug,
      label: CATEGORY_SHORT[slug] ?? catalog[slug]?.shortLabel ?? SERVICE_LABELS[slug] ?? slug,
      icon: SERVICE_ICONS[slug] ?? "plus-circle",
    }));
  }, [activeSlugs, catalog]);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((c) => c.slug === selectedCategory)) {
      setSelectedCategory(String(categories[0]!.slug));
    }
  }, [categories, selectedCategory]);

  const allServices: PopularServiceItem[] = useMemo(() => {
    return categories
      .filter((c) => c.slug !== "all")
      .map((c) => {
        const slug = c.slug as ServiceSlug;
        const cfg = catalog[slug];
        return {
          slug,
          title: cfg?.label ?? SERVICE_LABELS[slug] ?? c.label,
          priceZar: cfg?.basePrice ?? null,
          icon: c.icon,
          rating: "4.9",
        };
      });
  }, [catalog, categories]);

  const displayServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allServices;
    if (q) {
      list = list.filter(
        (s) => s.title.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
      );
    }
    // Selected category first (matches mock: active category + other popular rows)
    return [...list].sort((a, b) => {
      if (a.slug === selectedCategory) return -1;
      if (b.slug === selectedCategory) return 1;
      return 0;
    });
  }, [allServices, search, selectedCategory]);

  const loading =
    (summaryQuery.isLoading && !summaryQuery.data) ||
    (servicesQuery.isLoading && !servicesQuery.data);

  if (loading) {
    return (
      <Screen scroll={false} edges={["top"]} style={{ backgroundColor: homeColors.bg }}>
        <HomeSkeleton />
      </Screen>
    );
  }

  if (summaryQuery.isError && !summaryQuery.data && servicesQuery.isError && !servicesQuery.data) {
    return (
      <Screen scroll={false} edges={["top"]} style={{ backgroundColor: homeColors.bg }}>
        <ErrorState
          title="Couldn’t load home"
          message={friendlyErrorMessage(summaryQuery.error ?? servicesQuery.error)}
          onRetry={() => {
            void summaryQuery.refetch();
            void servicesQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const summary = summaryQuery.data;

  return (
    <Screen
      scroll
      edges={["top"]}
      style={{ backgroundColor: homeColors.bg }}
      contentClassName="px-5 pt-3"
      contentContainerStyle={{ paddingBottom: 140 }}
      refreshControl={
        <RefreshControl
          refreshing={
            (summaryQuery.isFetching || servicesQuery.isFetching) &&
            !summaryQuery.isLoading &&
            !servicesQuery.isLoading
          }
          onRefresh={() => {
            void summaryQuery.refetch();
            void servicesQuery.refetch();
            void notificationsQuery.refetch();
          }}
          tintColor={homeColors.primary}
        />
      }
    >
      <HomeHeader name={greeting} unreadCount={notificationsQuery.data?.unreadCount ?? 0} />

      <HomeSearchBar
        value={search}
        onChangeText={setSearch}
        onFilterPress={() => {
          const slug = (
            selectedCategory !== "all" ? selectedCategory : categories[0]?.slug
          ) as ServiceSlug | undefined;
          if (slug) router.push(`/book/${slug}/details` as never);
        }}
      />

      {(summary?.isOverdue || summary?.hasOverdueInvoice) && (
        <SectionCard className="mb-4 bg-status-warning-bg" flush>
          <Text className="text-body font-semibold text-status-warning-fg">Invoice attention</Text>
          <Text className="mt-1 text-caption text-status-warning-fg">
            {summary.isOverdue && summary.daysOverdue > 0
              ? `Your monthly invoice is ${summary.daysOverdue} day${summary.daysOverdue === 1 ? "" : "s"} overdue.`
              : "You have an overdue invoice. Pay from Billing when it’s available in the app."}
          </Text>
        </SectionCard>
      )}

      <HomeCategories
        categories={categories}
        selectedSlug={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <HomePromoBanner
        onBookPress={() => {
          const slug = (
            selectedCategory !== "all" ? selectedCategory : categories[0]?.slug
          ) as ServiceSlug | undefined;
          if (slug) {
            router.push(`/book/${slug}/details` as never);
          }
        }}
      />

      <HomePopularServices services={displayServices.slice(0, 4)} />
    </Screen>
  );
}
