import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { formatCleanerJobEarningsLabel } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { JobActionBar } from "@/features/jobs/JobActionBar";
import { JobPhotosPanel } from "@/features/jobs/JobPhotosPanel";
import { JobProgressStepper } from "@/features/jobs/JobProgressStepper";
import { openAddressInMaps, openPhoneDialer } from "@/lib/jobs/jobDeepLinks";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useJobDetail } from "@/hooks/useCleanerJobs";
import {
  extrasLabels,
  formatDuration,
  formatFriendlyYmd,
  formatJobTime,
  formatTimelineClock,
  jobEarningsCents,
  jobEarningsIsEstimate,
  jobStatusLabel,
  jobStatusTone,
  jobTimelineEvents,
} from "@/lib/jobs/jobDisplay";
import { colors } from "@/theme";

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookingId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : undefined;
  const { data: job, isLoading, isError, error, refetch, isRefetching } = useJobDetail(bookingId);
  const insets = useSafeAreaInsets();

  if (!bookingId) {
    return <EmptyState title="Missing job" message="No job id was provided." icon="alert-circle-outline" />;
  }

  if (isLoading && !job) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <LoadingState label="Loading job…" />
      </View>
    );
  }

  if (isError && !job) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load job"
          message={friendlyErrorMessage(error)}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (!job) {
    return <EmptyState title="Job not found" icon="search-outline" />;
  }

  const address = String(job.location_display || job.location || "").trim() || "—";
  const phone = String(job.customer_phone ?? "").trim();
  const service =
    String(job.service_name || job.service || job.service_type || "").trim() || "Cleaning";
  const earningsCents = jobEarningsCents(job);
  const payLabel = formatCleanerJobEarningsLabel(earningsCents, {
    estimate: jobEarningsIsEstimate(job),
  });
  const extras = extrasLabels(job);
  const scope = (job.scope_lines ?? []).filter(Boolean);
  const access = (job.access_detail_lines ?? []).filter(Boolean);
  const notes = String(job.job_notes ?? "").trim();
  const canMaps = Boolean(address && address !== "—");
  const timeline = jobTimelineEvents(job);

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pb-6 pt-2"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <JobProgressStepper job={job} />

        <SectionCard elevated>
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <StatusBadge label={jobStatusLabel(job)} tone={jobStatusTone(job)} />
              <Text className="mt-2 text-2xl font-bold text-ink" accessibilityRole="header">
                {String(job.customer_name ?? "").trim() || "Customer"}
              </Text>
            </View>
            <View className="items-end rounded-xl bg-earnings-bg px-3 py-2">
              <Text className="text-caption text-earnings-fg">
                {jobEarningsIsEstimate(job) ? "Est. pay" : "Pay"}
              </Text>
              <Text className="text-base font-bold text-earnings-fg">{payLabel}</Text>
            </View>
          </View>

          <View className="mt-3 flex-row gap-2">
            {phone ? (
              <QuickAction
                icon="call-outline"
                label="Call"
                accessibilityLabel={`Call ${phone}`}
                onPress={() => openPhoneDialer(phone)}
              />
            ) : null}
            {canMaps ? (
              <QuickAction
                icon="navigate-outline"
                label="Directions"
                accessibilityLabel={`Open directions to ${address}`}
                onPress={() => openAddressInMaps(address)}
              />
            ) : null}
          </View>

          <View className="mt-4 gap-2 border-t border-border pt-3">
            <MetaRow icon="time-outline" text={`${formatJobTime(job.time)} · ${formatDuration(job)}`} />
            {job.date ? <MetaRow icon="calendar-outline" text={formatFriendlyYmd(String(job.date))} /> : null}
            <MetaRow icon="location-outline" text={address} />
            <MetaRow icon="briefcase-outline" text={service} />
          </View>
        </SectionCard>

        {access.length > 0 ? (
          <View className="rounded-2xl border border-status-warning-fg bg-status-warning-bg p-4">
            <Text className="mb-2 text-label font-semibold uppercase tracking-wide text-status-warning-fg">
              Access
            </Text>
            {access.map((line) => (
              <Text key={line} className="mb-1 text-sm font-medium text-status-warning-fg">
                · {line}
              </Text>
            ))}
          </View>
        ) : null}

        <SectionCard title="Service">
          <Text className="text-base text-ink">{service}</Text>
          {(job.service_detail_lines ?? []).map((line) => (
            <Text key={line} className="mt-1 text-sm text-ink-muted">
              {line}
            </Text>
          ))}
        </SectionCard>

        {scope.length > 0 ? (
          <SectionCard title="Checklist / scope">
            {scope.map((line) => (
              <Text key={line} className="mb-1.5 text-sm text-ink">
                · {line}
              </Text>
            ))}
          </SectionCard>
        ) : null}

        {extras.length > 0 ? (
          <SectionCard title="Extras">
            {extras.map((name) => (
              <Text key={name} className="mb-1 text-sm text-ink">
                · {name}
              </Text>
            ))}
          </SectionCard>
        ) : null}

        {notes ? (
          <SectionCard title="Notes">
            <Text className="text-sm leading-5 text-ink">{notes}</Text>
          </SectionCard>
        ) : null}

        {timeline.length > 0 ? (
          <SectionCard title="Timeline">
            {timeline.map((event, index) => (
              <View
                key={event.key}
                className={`flex-row gap-3 ${index < timeline.length - 1 ? "mb-3" : ""}`}
              >
                <View className="items-center">
                  <View className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                  {index < timeline.length - 1 ? (
                    <View className="mt-1 w-0.5 flex-1 bg-border" style={{ minHeight: 16 }} />
                  ) : null}
                </View>
                <View className="flex-1 pb-0.5">
                  <Text className="text-sm font-semibold text-ink">{event.label}</Text>
                  <Text className="text-caption text-ink-muted">{formatTimelineClock(event.at)}</Text>
                </View>
              </View>
            ))}
          </SectionCard>
        ) : null}

        <SectionCard title="Photos" flush>
          <JobPhotosPanel job={job} />
        </SectionCard>
      </ScrollView>

      <View
        className="border-t border-border bg-surface-card px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <JobActionBar job={job} />
      </View>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="min-h-touch flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 active:opacity-80"
      android_ripple={{ color: colors.surface.muted }}
    >
      <Ionicons name={icon} size={18} color={colors.brand[600]} />
      <Text className="text-sm font-semibold text-brand-600">{label}</Text>
    </Pressable>
  );
}

function MetaRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Ionicons name={icon} size={16} color={colors.ink.muted} style={{ marginTop: 2 }} />
      <Text className="flex-1 text-sm text-ink">{text}</Text>
    </View>
  );
}
