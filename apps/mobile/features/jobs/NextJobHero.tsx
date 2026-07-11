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

type Props = { job: CleanerJobWire };

/** Highlighted “what should I do next?” card on the Today dashboard. */
export function NextJobHero({ job }: Props) {
  const router = useRouter();
  const customer = String(job.customer_name ?? "").trim() || "Customer";
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

  const onPrimary = () => {
    if (cta.kind === "accept") {
      mutation.mutate("accept", {
        onError: (err) => Alert.alert("Could not accept", friendlyErrorMessage(err)),
      });
      return;
    }
    openJob();
  };

  return (
    <View
      className="mb-4 overflow-hidden rounded-2xl border border-brand-200 bg-surface-card"
      style={shadows.md}
      accessibilityRole="summary"
      accessibilityLabel={`Next up: ${customer} at ${time}`}
    >
      <View className="bg-brand-50 px-4 py-2">
        <Text className="text-overline font-semibold uppercase tracking-wide text-brand-600">
          Next up
        </Text>
      </View>

      <Pressable onPress={openJob} className="px-4 pt-3 active:opacity-90">
        <View className="mb-2 flex-row items-start justify-between gap-3">
          <Text className="text-3xl font-bold text-ink">{time}</Text>
          <StatusBadge label={jobStatusLabel(job)} tone={jobStatusTone(job)} />
        </View>
        <Text className="text-xl font-semibold text-ink" numberOfLines={1}>
          {customer}
        </Text>
        <Text className="mt-1 text-base text-ink-muted">
          {area} · {service} · {duration}
        </Text>
        <View className="mt-3 self-start rounded-lg bg-earnings-bg px-2.5 py-1">
          <Text className="text-sm font-semibold text-earnings-fg">{pay}</Text>
        </View>
      </Pressable>

      <View className="flex-row items-center gap-2 px-4 py-4">
        <AppButton
          label={cta.label === "Open" ? "Open job" : cta.label}
          loading={mutation.isPending}
          disabled={mutation.isPending}
          onPress={onPrimary}
          className="flex-1"
        />
        <Pressable
          onPress={openJob}
          accessibilityRole="button"
          accessibilityLabel="Job details"
          className="min-h-touch min-w-touch items-center justify-center rounded-xl border border-border bg-surface"
        >
          <Ionicons name="chevron-forward" size={22} color={colors.ink.default} />
        </Pressable>
      </View>
    </View>
  );
}
