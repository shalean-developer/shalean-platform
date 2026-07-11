import { Pressable, Text, View } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDuration, formatJobTime, jobStatusLabel, jobStatusTone } from "@/lib/jobs/jobDisplay";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

type Props = { job: CleanerJobWire };

export function JobListCard({ job }: Props) {
  const address = String(job.location_display || job.location || "").trim() || "Address unavailable";
  const customer = String(job.customer_name ?? "").trim() || "Customer";
  const status = jobStatusLabel(job);
  const time = formatJobTime(job.time);
  const duration = formatDuration(job);

  return (
    <Link href={`/(cleaner)/job/${job.id}`} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${customer}, ${time}, ${status}, ${address}`}
        accessibilityHint="Opens job details"
        className="mb-3 min-h-[80px] rounded-2xl border border-surface-muted bg-surface-card px-4 py-4 active:opacity-90"
        android_ripple={{ color: colors.surface.muted }}
      >
        <View className="mb-2 flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-lg font-semibold text-ink" numberOfLines={1}>
            {customer}
          </Text>
          <StatusBadge label={status} tone={jobStatusTone(job)} />
        </View>
        <View className="mb-1.5 flex-row items-center gap-1.5">
          <Ionicons name="time-outline" size={16} color={colors.ink.muted} />
          <Text className="text-base text-ink">
            {time} · {duration}
          </Text>
        </View>
        <View className="flex-row items-start gap-1.5">
          <Ionicons name="location-outline" size={16} color={colors.ink.muted} style={{ marginTop: 2 }} />
          <Text className="flex-1 text-sm text-ink-muted" numberOfLines={2}>
            {address}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.ink.muted} style={{ marginTop: 2 }} />
        </View>
      </Pressable>
    </Link>
  );
}
