import { useCallback, useMemo } from "react";
import { Alert, Linking, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { formatZarWhole } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { SectionCard } from "@/components/ui/SectionCard";
import { API_UPSTREAM_URL } from "@/constants/config";
import { cleanerReferralInviteUrl, cleanerSupportWhatsAppHref } from "@/constants/support";
import { useCleanerReferrals } from "@/hooks/useCleanerEngagement";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import { useToast } from "@/providers/ToastProvider";

/** Refer cleaners — code + share from /api/cleaner/referrals/me. */
export default function ReferralScreen() {
  const { syncNow } = useConnectivity();
  const { showToast } = useToast();
  const { data, isLoading, isError, error, refetch, isRefetching } = useCleanerReferrals();

  const inviteUrl = useMemo(() => {
    if (!data?.referralCode) return "";
    return cleanerReferralInviteUrl(API_UPSTREAM_URL || "https://shalean.co.za", data.referralCode);
  }, [data?.referralCode]);

  const shareText = useMemo(() => {
    if (!data?.referralCode || !inviteUrl) return "";
    return `Join Shalean as a cleaner with my referral code ${data.referralCode}: ${inviteUrl}`;
  }, [data?.referralCode, inviteUrl]);

  const onRefresh = useCallback(async () => {
    await syncNow();
    await refetch();
  }, [refetch, syncNow]);

  const onShare = async () => {
    if (!shareText) return;
    try {
      await Share.share({ message: shareText, title: "Shalean cleaner referral" });
    } catch (e) {
      Alert.alert("Share failed", friendlyErrorMessage(e));
    }
  };

  const onWhatsApp = () => {
    if (!shareText) return;
    void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`);
  };

  const onCopyHint = () => {
    if (!inviteUrl) return;
    void Share.share({ message: inviteUrl }).then(() => showToast("Share sheet opened — copy from there", "info"));
  };

  if (isLoading && !data) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <LoadingState label="Loading referral…" />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load referral"
          message={friendlyErrorMessage(error)}
          onRetry={() => void onRefresh()}
        />
      </View>
    );
  }

  if (!data?.referralCode) {
    return <EmptyState title="No referral code" message="Try again in a moment." icon="people-outline" />;
  }

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-10 pt-2"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void onRefresh()} />}
      >
        <SectionCard elevated>
          <Text className="text-overline font-semibold uppercase tracking-wide text-ink-muted">
            Your code
          </Text>
          <Text
            className="mt-2 text-center text-3xl font-bold tracking-widest text-brand-600"
            accessibilityRole="header"
            selectable
          >
            {data.referralCode}
          </Text>
          <Text className="mt-3 text-center text-sm text-ink-muted">
            Share this code so new cleaners can apply with your referral.
          </Text>
        </SectionCard>

        <View className="flex-row gap-2">
          <Stat label="Successful" value={String(data.referralsCount ?? 0)} />
          <Stat label="Rewards" value={formatZarWhole(Number(data.totalEarned ?? 0))} />
          <Stat label="Bonus" value={formatZarWhole(Number(data.bonusPayout ?? 0))} />
        </View>

        <SectionCard title="Invite link">
          <Text className="text-sm text-ink" selectable>
            {inviteUrl}
          </Text>
        </SectionCard>

        <AppButton label="Share invite" onPress={() => void onShare()} />
        <AppButton label="Share on WhatsApp" variant="secondary" onPress={onWhatsApp} />
        <AppButton label="Copy via share sheet" variant="ghost" onPress={onCopyHint} />

        <SectionCard>
          <Text className="text-sm text-ink-muted">
            Rewards are credited when a referred cleaner completes the program requirements. Questions?
            Message ops from Support.
          </Text>
          <AppButton
            label="Ask ops about referrals"
            variant="ghost"
            className="mt-2"
            onPress={() =>
              void Linking.openURL(
                cleanerSupportWhatsAppHref("Hi, I have a question about my cleaner referral rewards."),
              )
            }
          />
        </SectionCard>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl border border-border bg-surface-card px-2 py-3">
      <Text className="text-base font-bold text-ink">{value}</Text>
      <Text className="mt-0.5 text-caption text-ink-muted">{label}</Text>
    </View>
  );
}
