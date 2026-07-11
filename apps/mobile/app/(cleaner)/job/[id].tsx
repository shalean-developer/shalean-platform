import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { formatCleanerJobEarningsLabel } from "@shalean/utils";
import { OfflineBanner } from "@/components/OfflineBanner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { JobActionBar } from "@/features/jobs/JobActionBar";
import { JobPhotosPanel } from "@/features/jobs/JobPhotosPanel";
import { openAddressInMaps, openPhoneDialer } from "@/lib/jobs/jobDeepLinks";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useJobDetail } from "@/hooks/useCleanerJobs";
import {
  extrasLabels,
  formatDuration,
  formatFriendlyYmd,
  formatJobTime,
  jobStatusLabel,
  jobStatusTone,
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
  const earningsCents = job.displayEarningsCents ?? job.display_earnings_cents ?? job.earnings_cents;
  const extras = extrasLabels(job);
  const scope = (job.scope_lines ?? []).filter(Boolean);
  const access = (job.access_detail_lines ?? []).filter(Boolean);
  const notes = String(job.job_notes ?? "").trim();
  const canMaps = Boolean(address && address !== "—");

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pb-6 pt-2"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <View className="rounded-2xl border border-surface-muted bg-surface-card p-4">
          <StatusBadge label={jobStatusLabel(job)} tone={jobStatusTone(job)} />
          <Text className="mt-2 text-2xl font-bold text-ink" accessibilityRole="header">
            {String(job.customer_name ?? "").trim() || "Customer"}
          </Text>

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

          <View className="mt-4 gap-2 border-t border-surface-muted pt-3">
            <MetaRow icon="time-outline" text={`${formatJobTime(job.time)} · ${formatDuration(job)}`} />
            {job.date ? <MetaRow icon="calendar-outline" text={formatFriendlyYmd(String(job.date))} /> : null}
            <MetaRow icon="location-outline" text={address} />
            <MetaRow
              icon="cash-outline"
              text={`Pay: ${formatCleanerJobEarningsLabel(earningsCents, {
                estimate: job.displayEarningsIsEstimate === true || job.earnings_is_estimate === true,
              })}`}
            />
          </View>
        </View>

        <Section title="Service">
          <Text className="text-base text-ink">{service}</Text>
          {(job.service_detail_lines ?? []).map((line) => (
            <Text key={line} className="mt-1 text-sm text-ink-muted">
              {line}
            </Text>
          ))}
        </Section>

        {scope.length > 0 ? (
          <Section title="Scope">
            {scope.map((line) => (
              <Text key={line} className="mb-1 text-sm text-ink">
                · {line}
              </Text>
            ))}
          </Section>
        ) : null}

        {extras.length > 0 ? (
          <Section title="Extras">
            {extras.map((name) => (
              <Text key={name} className="mb-1 text-sm text-ink">
                · {name}
              </Text>
            ))}
          </Section>
        ) : null}

        {access.length > 0 ? (
          <Section title="Access">
            {access.map((line) => (
              <Text key={line} className="mb-1 text-sm text-ink">
                · {line}
              </Text>
            ))}
          </Section>
        ) : null}

        {notes ? (
          <Section title="Notes">
            <Text className="text-sm leading-5 text-ink">{notes}</Text>
          </Section>
        ) : null}

        <Section title="Photos" flush>
          <JobPhotosPanel job={job} />
        </Section>
      </ScrollView>

      <View
        className="border-t border-surface-muted bg-surface-card px-4 pt-3"
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
      className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-surface-muted bg-surface px-3 active:opacity-80"
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

function Section({
  title,
  children,
  flush,
}: {
  title: string;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <View className={`rounded-2xl border border-surface-muted bg-surface-card ${flush ? "p-3" : "p-4"}`}>
      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</Text>
      {children}
    </View>
  );
}
