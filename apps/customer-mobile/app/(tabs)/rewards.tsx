import { formatZar } from "@/lib/booking/displayPricing";
import {
  useAccountRewards,
  useCustomerReviews,
  useReferralsMe,
} from "@/hooks/useCustomerRewards";
import { useCustomerBookingsList } from "@/hooks/useCustomerBookings";
import { isBookingPendingCustomerReview } from "@/lib/rewards/reviewEligibility";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { EmptyState, ErrorState, LoadingState, Screen } from "@shalean/mobile-ui";
import { useMemo } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { homeColors } from "@/features/home/homeTheme";
import {
  ScreenTitle,
  SectionHeading,
  SoftActionChip,
  softCardStyle,
} from "@/features/shared/SoftUi";
import { AppText } from "@/theme";

function formatExpiry(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

export default function RewardsHubScreen() {
  const router = useRouter();
  const rewardsQuery = useAccountRewards();
  const referralsQuery = useReferralsMe();
  const reviewsQuery = useCustomerReviews();
  const bookingsQuery = useCustomerBookingsList();

  const pendingReviewCount = useMemo(() => {
    const reviewed = new Set((reviewsQuery.data ?? []).map((r) => r.booking_id));
    return (bookingsQuery.data ?? []).filter((b) => isBookingPendingCustomerReview(b, reviewed))
      .length;
  }, [bookingsQuery.data, reviewsQuery.data]);

  const refreshing =
    (rewardsQuery.isRefetching || referralsQuery.isRefetching) &&
    !rewardsQuery.isLoading &&
    !referralsQuery.isLoading;

  if (
    (rewardsQuery.isLoading || referralsQuery.isLoading) &&
    !rewardsQuery.data &&
    !referralsQuery.data
  ) {
    return (
      <Screen scroll={false} edges={["top"]} style={{ backgroundColor: homeColors.bg }}>
        <LoadingState label="Loading rewards…" />
      </Screen>
    );
  }

  if (rewardsQuery.isError && !rewardsQuery.data) {
    return (
      <Screen scroll={false} edges={["top"]} style={{ backgroundColor: homeColors.bg }}>
        <ErrorState
          title="Couldn’t load rewards"
          message={friendlyErrorMessage(rewardsQuery.error)}
          onRetry={() => {
            void rewardsQuery.refetch();
            void referralsQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const credits = rewardsQuery.data?.referralCredits;
  const balance = credits?.balanceZar ?? referralsQuery.data?.creditBalance ?? 0;
  const tier = rewardsQuery.data?.profile?.tier?.trim() || "regular";
  const code = referralsQuery.data?.referralCode?.trim() || "—";
  const expiry = formatExpiry(credits?.nextExpiryAt ?? referralsQuery.data?.nextExpiryAt);
  const birthday = rewardsQuery.data?.birthdayReward;
  const promos = rewardsQuery.data?.activePromotions ?? [];
  const expiring = rewardsQuery.data?.expiringRewards ?? [];
  const successful = referralsQuery.data?.successfulReferrals ?? 0;
  const pending = referralsQuery.data?.pendingReferrals ?? 0;

  return (
    <Screen
      scroll
      edges={["top"]}
      style={{ backgroundColor: homeColors.bg }}
      contentClassName="pb-28 pt-1"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void rewardsQuery.refetch();
            void referralsQuery.refetch();
            void reviewsQuery.refetch();
            void bookingsQuery.refetch();
          }}
          tintColor={homeColors.primary}
        />
      }
    >
      <ScreenTitle title="Rewards" subtitle="Credits, referrals & offers" />

      {/* Hero credit card */}
      <View
        style={{
          marginBottom: 16,
          borderRadius: 24,
          backgroundColor: homeColors.primary,
          padding: 18,
          overflow: "hidden",
        }}
      >
        <AppText
          variant="secondary"
          style={{ color: "rgba(255,255,255,0.8)", fontWeight: "600" }}
        >
          Cleaning credit
        </AppText>
        <AppText
          variant="hero"
          style={{
            color: "#FFFFFF",
            fontWeight: "800",
            marginTop: 6,
            letterSpacing: -0.5,
          }}
        >
          {formatZar(balance)}
        </AppText>
        <AppText
          variant="secondary"
          style={{ color: "rgba(255,255,255,0.75)", marginTop: 6 }}
        >
          Tier · {tier.charAt(0).toUpperCase() + tier.slice(1)}
          {expiry ? ` · Exp ${expiry}` : ""}
        </AppText>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Pressable
            onPress={() => router.push("/rewards/credit-history" as never)}
            accessibilityRole="button"
            style={{
              flex: 1,
              minHeight: 42,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: "rgba(255,255,255,0.18)",
              borderRadius: 14,
              paddingHorizontal: 10,
            }}
          >
            <Feather name="clock" size={15} color="#FFFFFF" />
            <AppText variant="secondary" style={{ color: "#FFFFFF", fontWeight: "700" }}>
              History
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => router.push("/book/regular-cleaning/details" as never)}
            accessibilityRole="button"
            style={{
              flex: 1,
              minHeight: 42,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              paddingHorizontal: 10,
            }}
          >
            <Feather name="calendar" size={15} color={homeColors.primary} />
            <AppText
              variant="secondary"
              style={{ color: homeColors.primary, fontWeight: "700" }}
            >
              Use credit
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Quick actions */}
      <View style={[softCardStyle, { marginBottom: 16 }]}>
        <AppText
          variant="body"
          style={{ color: homeColors.ink, fontWeight: "700", marginBottom: 12 }}
        >
          Quick actions
        </AppText>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SoftActionChip
            label="Refer"
            icon="share-2"
            onPress={() => router.push("/rewards/referrals" as never)}
          />
          <SoftActionChip
            label="Reviews"
            icon="star"
            badge={pendingReviewCount}
            onPress={() => router.push("/rewards/reviews" as never)}
          />
          <SoftActionChip
            label="Book"
            icon="plus-circle"
            primary
            onPress={() => router.push("/book/regular-cleaning/details" as never)}
          />
        </View>
      </View>

      {/* Referral code card */}
      <View style={[softCardStyle, { marginBottom: 16 }]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="label" style={{ color: homeColors.muted, fontWeight: "600" }}>
              Your referral code
            </AppText>
            <AppText
              variant="title"
              selectable
              style={{
                color: homeColors.ink,
                fontWeight: "800",
                marginTop: 6,
                letterSpacing: 1,
              }}
            >
              {code}
            </AppText>
            <AppText variant="secondary" style={{ color: homeColors.muted, marginTop: 6 }}>
              {successful} successful · {pending} pending
            </AppText>
          </View>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: homeColors.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="gift" size={20} color={homeColors.primary} />
          </View>
        </View>
        <View
          style={{
            height: 1,
            backgroundColor: "#EEF1F4",
            marginVertical: 14,
          }}
        />
        <SoftActionChip
          label="Invite friends"
          icon="share-2"
          primary
          flex={false}
          onPress={() => router.push("/rewards/referrals" as never)}
        />
      </View>

      {birthday ? (
        <View style={[softCardStyle, { marginBottom: 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: homeColors.primarySoft,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="gift" size={18} color={homeColors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="body" style={{ color: homeColors.ink, fontWeight: "700" }}>
                Birthday reward
              </AppText>
              <AppText variant="secondary" style={{ color: homeColors.muted, marginTop: 2 }}>
                {formatZar(birthday.creditZar)} · {birthday.daysLeft} days left
              </AppText>
            </View>
          </View>
        </View>
      ) : null}

      {expiring.length > 0 ? (
        <View style={{ marginBottom: 16 }}>
          <SectionHeading title="Expiring soon" subtitle={`${expiring.length} items`} />
          <View style={{ gap: 10 }}>
            {expiring.slice(0, 3).map((e) => (
              <View key={`${e.type}-${e.expiresAt}`} style={softCardStyle}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <AppText
                    variant="body"
                    style={{ color: homeColors.ink, fontWeight: "600", flex: 1 }}
                    numberOfLines={1}
                  >
                    {e.label}
                  </AppText>
                  <AppText
                    variant="body"
                    style={{ color: homeColors.primary, fontWeight: "700" }}
                  >
                    {formatZar(e.amountZar)}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ marginBottom: 16 }}>
        <SectionHeading
          title="Active offers"
          subtitle={promos.length > 0 ? `${promos.length} available` : "None right now"}
        />
        {promos.length > 0 ? (
          <View style={{ gap: 10 }}>
            {promos.slice(0, 5).map((p) => (
              <View key={p.id} style={softCardStyle}>
                <AppText variant="body" style={{ color: homeColors.ink, fontWeight: "700" }}>
                  {p.headline || p.name}
                </AppText>
                {p.promoCode ? (
                  <View
                    style={{
                      alignSelf: "flex-start",
                      marginTop: 8,
                      backgroundColor: homeColors.primarySoft,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                    }}
                  >
                    <AppText
                      variant="label"
                      style={{
                        color: homeColors.primaryLight,
                        fontWeight: "700",
                        letterSpacing: 0.5,
                      }}
                    >
                      {p.promoCode}
                    </AppText>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={[softCardStyle, { paddingVertical: 8 }]}>
            <EmptyState
              title="No promo banners"
              message="Referral credit and VIP pricing still apply at checkout when available."
            />
          </View>
        )}
      </View>

      {rewardsQuery.data?.membership ? (
        <View style={[softCardStyle, { marginBottom: 8 }]}>
          <AppText variant="label" style={{ color: homeColors.muted, fontWeight: "600" }}>
            Membership
          </AppText>
          <AppText
            variant="body"
            style={{ color: homeColors.ink, fontWeight: "700", marginTop: 4 }}
          >
            {rewardsQuery.data.membership.plan?.name ?? rewardsQuery.data.membership.status}
            {rewardsQuery.data.membership.discountPercent > 0
              ? ` · ${rewardsQuery.data.membership.discountPercent}% off`
              : ""}
          </AppText>
          <AppText variant="secondary" style={{ color: homeColors.muted, marginTop: 4 }}>
            Saved {formatZar(rewardsQuery.data.membership.savingsToDateZar)} to date · applies at
            checkout
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}
