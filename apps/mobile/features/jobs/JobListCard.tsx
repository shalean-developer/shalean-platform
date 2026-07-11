import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatCleanerJobEarningsLabel } from "@shalean/utils";
import { AppButton } from "@/components/ui/AppButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { primaryCardAction } from "@/lib/jobs/deriveCleanerJobActions";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useJobLifecycleMutation } from "@/hooks/useJobActions";
import {
  formatDuration,
  formatJobTime,
  jobAreaLabel,
  jobEarningsCents,
  jobEarningsIsEstimate,
  jobServiceLabel,
  jobStatusLabel,
  jobStatusTone,
} from "@/lib/jobs/jobDisplay";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors, shadows } from "@/theme";

type Props = {
  job: CleanerJobWire;
  /** Hide accept inline action (e.g. when shown in hero) */
  compact?: boolean;
};

export function JobListCard({ job, compact = false }: Props) {
  const router = useRouter();
  const customer = String(job.customer_name ?? "").trim() || "Customer";
  const status = jobStatusLabel(job);
  const time = formatJobTime(job.time);
  const duration = formatDuration(job);
  const area = jobAreaLabel(job);
  const service = jobServiceLabel(job);
  const pay = formatCleanerJobEarningsLabel(jobEarningsCents(job), {
    estimate: jobEarningsIsEstimate(job),
  });
  const cta = primaryCardAction(job);
  const mutation = useJobLifecycleMutation(job.id);

  const openJob = () => router.push(`/(cleaner)/job/${job.id}`);

  const onAccept = () => {
    mutation.mutate("accept", {
      onError: (err) => Alert.alert("Could not accept", friendlyErrorMessage(err)),
    });
  };

  return (
    <View
      className="mb-3 overflow-hidden rounded-2xl border border-border bg-surface-card"
      style={shadows.sm}
    >
      <Pressable
        onPress={openJob}
        accessibilityRole="button"
        accessibilityLabel={`${customer}, ${time}, ${status}, ${area}, ${service}, ${pay}`}
        accessibilityHint="Opens job details"
        className="px-4 pb-3 pt-4 active:opacity-90"
        android_ripple={{ color: colors.surface.muted }}
      >
        <View className="mb-2 flex-row items-start justify-between gap-3">
          <Text className="text-2xl font-bold text-ink" accessibilityRole="text">
            {time}
          </Text>
          <StatusBadge label={status} tone={jobStatusTone(job)} />
        </View>

        <Text className="text-lg font-semibold text-ink" numberOfLines={1}>
          {customer}
        </Text>

        <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Meta icon="briefcase-outline" text={service} />
          <Meta icon="time-outline" text={duration} />
          <Meta icon="location-outline" text={area} />
        </View>

        <View className="mt-3 flex-row items-center justify-between gap-2">
          <View className="rounded-lg bg-earnings-bg px-2.5 py-1">
            <Text className="text-sm font-semibold text-earnings-fg">{pay}</Text>
          </View>
          {!compact && cta.kind === "navigate" ? (
            <View className="flex-row items-center gap-1">
              <Text className="text-sm font-semibold text-brand-600">{cta.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.brand[600]} />
            </View>
          ) : null}
        </View>
      </Pressable>

      {!compact && cta.kind === "accept" ? (
        <View className="border-t border-border px-4 py-3">
          <AppButton
            label="Accept job"
            loading={mutation.isPending}
            disabled={mutation.isPending}
            onPress={onAccept}
          />
        </View>
      ) : null}
    </View>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Ionicons name={icon} size={14} color={colors.ink.muted} />
      <Text className="text-sm text-ink-muted" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
