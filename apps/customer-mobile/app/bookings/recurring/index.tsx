import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  SectionCard,
  StatusBadge,
} from "@shalean/mobile-ui";
import { formatZar } from "@/lib/booking/displayPricing";
import { formatBookingDate } from "@/lib/bookings/bookingDisplay";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import {
  useCustomerRecurringPlans,
  useRecurringPlanAction,
  type RecurringAction,
} from "@/hooks/useCustomerRecurring";
import type { RecurringPlanRow } from "@/services/types/customerBookings";

function frequencyLabel(frequency: string): string {
  switch (frequency.toLowerCase()) {
    case "weekly":
      return "Weekly";
    case "fortnightly":
      return "Fortnightly";
    case "monthly":
      return "Monthly";
    default:
      return frequency ? frequency.replace(/_/g, " ") : "Recurring";
  }
}

function planStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const s = status.toLowerCase();
  if (s === "active") return "success";
  if (s === "paused") return "warning";
  if (s === "cancelled") return "danger";
  return "neutral";
}

function RecurringPlanCard({
  plan,
  busy,
  onAction,
}: {
  plan: RecurringPlanRow;
  busy: boolean;
  onAction: (action: RecurringAction) => void;
}) {
  const st = plan.status.toLowerCase();
  const canPause = st === "active";
  const canResume = st === "paused";
  const canCancel = st === "active" || st === "paused";
  const skipQueued = Boolean(plan.skip_next_occurrence_date?.trim());
  const canSkip = st === "active" && Boolean(plan.next_run_date) && !skipQueued;
  const location = plan.template_location?.trim() || "Address on file";
  const title =
    plan.template_service_label?.trim() || `${frequencyLabel(plan.frequency)} clean`;

  return (
    <SectionCard className="mb-4">
      <View className="mb-2 flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className="text-body font-semibold text-ink">{title}</Text>
          <Text className="mt-0.5 text-caption text-ink-muted">
            {frequencyLabel(plan.frequency)}
            {plan.next_run_date
              ? ` · Next ${formatBookingDate(plan.next_run_date)}`
              : ""}
          </Text>
        </View>
        <StatusBadge
          label={plan.status.replace(/_/g, " ")}
          tone={planStatusTone(plan.status)}
        />
      </View>

      <Text className="mb-2 text-caption text-ink-muted" numberOfLines={2}>
        {location}
      </Text>
      {typeof plan.price === "number" && plan.price > 0 ? (
        <Text className="mb-3 text-caption font-semibold text-ink">
          {formatZar(plan.price)} per visit
        </Text>
      ) : null}
      {skipQueued ? (
        <Text className="mb-3 rounded-lg bg-status-warning-bg px-3 py-2 text-caption text-status-warning-fg">
          Next visit skipped for {plan.skip_next_occurrence_date}
        </Text>
      ) : null}

      <View className="gap-2">
        {canPause ? (
          <AppButton
            label="Pause plan"
            variant="secondary"
            disabled={busy}
            onPress={() => onAction("pause")}
          />
        ) : null}
        {canResume ? (
          <AppButton
            label="Resume plan"
            variant="secondary"
            disabled={busy}
            onPress={() => onAction("resume")}
          />
        ) : null}
        {canSkip ? (
          <AppButton
            label="Skip next visit"
            variant="secondary"
            disabled={busy}
            onPress={() => onAction("skip")}
          />
        ) : null}
        {canCancel ? (
          <AppButton
            label="Cancel plan"
            variant="danger"
            disabled={busy}
            onPress={() => onAction("cancel")}
          />
        ) : null}
      </View>
    </SectionCard>
  );
}

export default function RecurringPlansScreen() {
  const router = useRouter();
  const listQuery = useCustomerRecurringPlans();
  const actionMutation = useRecurringPlanAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  const runAction = useCallback(
    (plan: RecurringPlanRow, action: RecurringAction) => {
      const destructive = action === "cancel" || action === "skip";
      const titles: Record<RecurringAction, string> = {
        pause: "Pause this plan?",
        resume: "Resume this plan?",
        skip: "Skip the next visit?",
        cancel: "Cancel this plan?",
      };
      const messages: Record<RecurringAction, string> = {
        pause: "No new visits will be generated until you resume.",
        resume: "Visits will continue from the next scheduled date.",
        skip: "Only the next occurrence will be skipped.",
        cancel: "This recurring plan will stop. Existing bookings are unchanged.",
      };

      const execute = () => {
        setBusyId(plan.id);
        actionMutation.mutate(
          { id: plan.id, action },
          {
            onError: (err) => {
              Alert.alert("Something went wrong", friendlyErrorMessage(err));
            },
            onSettled: () => setBusyId(null),
          },
        );
      };

      if (destructive) {
        Alert.alert(titles[action], messages[action], [
          { text: "Keep", style: "cancel" },
          {
            text: action === "cancel" ? "Cancel plan" : "Skip",
            style: "destructive",
            onPress: execute,
          },
        ]);
        return;
      }

      Alert.alert(titles[action], messages[action], [
        { text: "Not now", style: "cancel" },
        { text: "Confirm", onPress: execute },
      ]);
    },
    [actionMutation],
  );

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <Screen scroll={false} edges={["top"]}>
        <LoadingState label="Loading plans…" />
      </Screen>
    );
  }

  if (listQuery.isError && !listQuery.data) {
    return (
      <Screen scroll={false} edges={["top"]}>
        <ErrorState
          title="Couldn’t load plans"
          message={friendlyErrorMessage(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
        />
      </Screen>
    );
  }

  const items = (listQuery.data ?? []).filter((p) => {
    const st = p.status.toLowerCase();
    return st === "active" || st === "paused";
  });

  return (
    <Screen
      scroll
      edges={["top"]}
      contentClassName="px-4 pb-10 pt-2"
      refreshControl={
        <RefreshControl
          refreshing={listQuery.isFetching && !listQuery.isLoading}
          onRefresh={() => void listQuery.refetch()}
          tintColor="#2563eb"
        />
      }
    >
      <Pressable onPress={() => router.back()} accessibilityRole="button" className="mb-3 self-start">
        <Text className="text-body font-semibold text-brand-600">← Back</Text>
      </Pressable>

      <Text className="text-label font-medium tracking-wide text-brand-600">
        Recurring
      </Text>
      <Text className="mb-1 text-title text-ink">Your plans</Text>
      <Text className="mb-5 text-body text-ink-muted">
        Pause, resume, skip a visit, or cancel anytime.
      </Text>

      {items.length === 0 ? (
        <View className="rounded-2xl border border-border bg-surface-card py-4">
          <EmptyState
            title="No recurring plans"
            message="Set up a recurring clean from Book when you’re ready."
            icon="repeat-outline"
          />
          <View className="px-6 pb-4">
            <AppButton
              label="Book a cleaning"
              onPress={() => router.push("/book/regular-cleaning/details" as never)}
            />
          </View>
        </View>
      ) : (
        items.map((plan) => (
          <RecurringPlanCard
            key={plan.id}
            plan={plan}
            busy={busyId === plan.id}
            onAction={(action) => runAction(plan, action)}
          />
        ))
      )}
    </Screen>
  );
}
