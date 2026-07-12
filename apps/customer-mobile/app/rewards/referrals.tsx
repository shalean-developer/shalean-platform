import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, Share, Text, View } from "react-native";
import {
  AppButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
} from "@shalean/mobile-ui";
import { formatZar } from "@/lib/booking/displayPricing";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import {
  buildCustomerReferralInviteUrl,
  buildReferralShareMessage,
} from "@/lib/rewards/customerReferralInvite";
import { CUSTOMER_ANALYTICS_EVENTS } from "@/lib/analytics/customerAnalyticsEvents";
import { trackCustomerEvent } from "@/lib/analytics/trackCustomerEvent";
import { useReferralSettings, useReferralsMe } from "@/hooks/useCustomerRewards";

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "rewarded") return "Rewarded";
  if (s === "pending") return "Pending";
  return status;
}

export default function ReferralsScreen() {
  const router = useRouter();
  const meQuery = useReferralsMe();
  const settingsQuery = useReferralSettings();
  const [copied, setCopied] = useState(false);

  if (meQuery.isLoading && !meQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <LoadingState label="Loading referrals…" />
      </Screen>
    );
  }

  if (meQuery.isError && !meQuery.data) {
    return (
      <Screen scroll={false} edges={["top", "bottom"]}>
        <ErrorState
          title="Couldn’t load referrals"
          message={friendlyErrorMessage(meQuery.error)}
          onRetry={() => void meQuery.refetch()}
        />
      </Screen>
    );
  }

  const code = meQuery.data?.referralCode?.trim() || "";
  const inviteUrl = code ? buildCustomerReferralInviteUrl(code) : "";
  const discount = settingsQuery.data?.checkoutDiscountZar;
  const reward = settingsQuery.data?.rewardAmountZar;
  const history = meQuery.data?.referralHistory ?? [];

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await Clipboard.setStringAsync(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Copy failed", "Long-press the link to copy instead.");
    }
  }

  async function shareInvite() {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: buildReferralShareMessage(inviteUrl),
        url: inviteUrl,
        title: "Shalean referral",
      });
      void trackCustomerEvent(CUSTOMER_ANALYTICS_EVENTS.REFERRAL_CREATED, {
        screen: "referrals",
        action: "share",
      });
    } catch {
      await copyLink();
    }
  }

  return (
    <Screen
      scroll
      edges={["top", "bottom"]}
      contentClassName="px-4 pb-10 pt-2"
      refreshControl={
        <RefreshControl
          refreshing={meQuery.isRefetching && !meQuery.isLoading}
          onRefresh={() => void meQuery.refetch()}
        />
      }
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text className="mb-2 text-caption font-semibold text-brand-600">← Rewards</Text>
      </Pressable>
      <Text className="mb-1 text-title text-ink">Refer friends</Text>
      <Text className="mb-5 text-body text-ink-muted">
        {settingsQuery.data?.heroSubheading?.trim() ||
          "Share your code. Friends get a discount; you earn cleaning credit when they book."}
      </Text>

      <SectionCard className="mb-4">
        <Text className="text-label font-medium tracking-wide text-ink-muted">
          Your code
        </Text>
        <Text className="mt-1 font-mono text-title text-ink" selectable>
          {code || "—"}
        </Text>
        {inviteUrl ? (
          <Text className="mt-2 text-caption text-ink-muted" selectable numberOfLines={2}>
            {inviteUrl}
          </Text>
        ) : null}
        {(discount != null || reward != null) && (
          <Text className="mt-3 text-body text-ink-muted">
            {discount != null ? `Friend saves ${formatZar(discount)}` : null}
            {discount != null && reward != null ? " · " : null}
            {reward != null ? `You earn ${formatZar(reward)}` : null}
          </Text>
        )}
        <View className="mt-4 gap-2">
          <AppButton label="Share invite" onPress={() => void shareInvite()} disabled={!code} />
          <AppButton
            label={copied ? "Copied" : "Copy link"}
            variant="secondary"
            onPress={() => void copyLink()}
            disabled={!code}
          />
        </View>
      </SectionCard>

      <SectionCard title="Stats" className="mb-4">
        <Text className="text-body text-ink">
          {meQuery.data?.successfulReferrals ?? 0} successful · {meQuery.data?.pendingReferrals ?? 0}{" "}
          pending · earned {formatZar(meQuery.data?.totalEarned ?? 0)}
        </Text>
        <Text className="mt-1 text-caption text-ink-muted">
          Credit balance {formatZar(meQuery.data?.creditBalance ?? 0)}
        </Text>
      </SectionCard>

      <Text className="mb-2 text-label font-medium tracking-wide text-ink-muted">
        History
      </Text>
      {history.length === 0 ? (
        <EmptyState title="No referrals yet" message="Share your link to get started." />
      ) : (
        <View className="gap-3">
          {history.map((row) => (
            <SectionCard key={row.id}>
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-body font-semibold text-ink">
                    {row.referredContact?.trim() || "Friend"}
                  </Text>
                  <Text className="mt-0.5 text-caption text-ink-muted">
                    {statusLabel(row.status)}
                    {row.rewardAmount > 0 ? ` · ${formatZar(row.rewardAmount)}` : ""}
                  </Text>
                </View>
              </View>
            </SectionCard>
          ))}
        </View>
      )}
    </Screen>
  );
}
