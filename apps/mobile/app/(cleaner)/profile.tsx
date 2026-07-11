import { RefreshControl, ScrollView, Text, View } from "react-native";
import { OfflineBanner } from "@/components/OfflineBanner";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { useCleanerProfile } from "@/hooks/useCleanerProfile";
import { useAuth } from "@/providers/AuthProvider";

export default function CleanerProfileScreen() {
  const { profile: authProfile } = useAuth();
  const { data, isLoading, isError, error, refetch, isRefetching } = useCleanerProfile();
  const cleaner = data?.cleaner ?? authProfile?.cleaner;

  if (isLoading && !cleaner) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <LoadingState label="Loading profile…" />
      </View>
    );
  }

  if (isError && !cleaner) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load profile"
          message={error instanceof Error ? error.message : "Please try again."}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  if (!cleaner) {
    return <EmptyState title="No profile" message="Cleaner profile is unavailable." icon="person-outline" />;
  }

  const fullName = cleaner.full_name ?? "Cleaner";
  const initial = fullName.trim().charAt(0).toUpperCase() || "C";
  const phone = cleaner.phone_number || cleaner.phone || "No phone on file";
  const statusLabel = formatStatus(cleaner.status);

  const rows: { label: string; value: string }[] = [
    { label: "Phone", value: phone },
  ];
  if (cleaner.email) rows.push({ label: "Email", value: cleaner.email });
  if (typeof cleaner.jobs_completed === "number") {
    rows.push({ label: "Jobs completed", value: String(cleaner.jobs_completed) });
  }
  if (typeof cleaner.rating === "number") {
    rows.push({ label: "Rating", value: cleaner.rating.toFixed(1) });
  }

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 py-4"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <View className="items-center rounded-2xl border border-surface-muted bg-surface-card px-4 py-6">
          <View
            className="mb-3 h-20 w-20 items-center justify-center rounded-full bg-brand-50"
            accessibilityLabel={`Avatar for ${fullName}`}
          >
            <Text className="text-3xl font-bold text-brand-600">{initial}</Text>
          </View>
          <Text className="text-2xl font-bold text-ink" accessibilityRole="header">
            {fullName}
          </Text>
          <View className="mt-2 rounded-md bg-brand-50 px-2.5 py-1">
            <Text className="text-xs font-semibold uppercase text-brand-600">{statusLabel}</Text>
          </View>
        </View>

        <View className="rounded-2xl border border-surface-muted bg-surface-card px-4">
          {rows.map((row, index) => (
            <View
              key={row.label}
              className={`py-3 ${index < rows.length - 1 ? "border-b border-surface-muted" : ""}`}
              accessible
              accessibilityLabel={`${row.label}: ${row.value}`}
            >
              <Text className="text-xs font-medium uppercase tracking-wide text-ink-muted">{row.label}</Text>
              <Text className="mt-1 text-base text-ink">{row.value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function formatStatus(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "Active";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
