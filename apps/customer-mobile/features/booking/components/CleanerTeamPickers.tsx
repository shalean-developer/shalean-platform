import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { CleanerAvatar } from "@/features/booking/components/CleanerAvatar";
import { CleanerProfileSheet } from "@/features/booking/components/CleanerProfileSheet";
import type { AvailableCleanerV2, AvailableTeam } from "@/services/types/bookingV2";
import { AppText, colors } from "@/theme";

type TeamProps = {
  teams: AvailableTeam[];
  loading: boolean;
  error: string | null;
  selectedTeamId: string;
  onSelect: (id: string, name: string) => void;
  needsDate: boolean;
};

export function TeamPicker({
  teams,
  loading,
  error,
  selectedTeamId,
  onSelect,
  needsDate,
}: TeamProps) {
  return (
    <View className="gap-2">
      <AppText variant="secondary" className="font-semibold text-ink">
        Select a team *
      </AppText>
      {needsDate ? (
        <AppText
          variant="secondary"
          className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-ink-muted"
        >
          Select a date to see team availability.
        </AppText>
      ) : null}
      {loading ? (
        <View className="flex-row items-center gap-2 py-3">
          <ActivityIndicator color={colors.brand[500]} size="small" />
          <AppText variant="secondary" className="text-ink-muted">
            Checking teams…
          </AppText>
        </View>
      ) : null}
      {error ? (
        <AppText variant="secondary" className="text-danger">
          {error}
        </AppText>
      ) : null}
      {teams.map((team) => {
        const on = selectedTeamId === team.id;
        const disabled = !team.available;
        return (
          <Pressable
            key={team.id}
            disabled={disabled}
            onPress={() => onSelect(team.id, team.name)}
            className={`rounded-xl border px-4 py-3 ${
              on ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
            } ${disabled ? "opacity-50" : ""}`}
          >
            <AppText variant="body" className="font-semibold text-ink">
              {team.name}
            </AppText>
            <AppText variant="secondary" className="text-ink-muted">
              {team.available ? "Available" : "Unavailable"}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function recommendPct(rating: number | null): number | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((rating / 5) * 100)));
}

function CleanerCard({
  cleaner,
  selected,
  disabled,
  onChoose,
  onViewProfile,
}: {
  cleaner: AvailableCleanerV2;
  selected: boolean;
  disabled: boolean;
  onChoose: () => void;
  onViewProfile: () => void;
}) {
  const pct = recommendPct(cleaner.rating);

  return (
    <View
      className={`overflow-hidden rounded-xl border bg-surface-card ${
        selected ? "border-brand-500" : "border-border"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <View className="flex-row items-center gap-3 px-3 py-3">
        <CleanerAvatar size={48} backgroundColor={colors.brand[50]} selected={selected} />
        <View className="min-w-0 flex-1">
          <AppText variant="body" className="font-semibold text-ink" numberOfLines={1}>
            {cleaner.name}
          </AppText>
          <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
            {pct != null ? (
              <View className="flex-row items-center gap-1">
                <Feather name="thumbs-up" size={12} color={colors.ink.muted} />
                <AppText variant="secondary" className="text-ink-muted">
                  {pct}%
                </AppText>
              </View>
            ) : null}
            {cleaner.rating != null && Number.isFinite(cleaner.rating) && cleaner.rating > 0 ? (
              <View className="flex-row items-center gap-1">
                <Feather name="star" size={12} color={colors.brand[500]} />
                <AppText variant="secondary" className="font-semibold text-ink">
                  {cleaner.rating.toFixed(1)}
                </AppText>
              </View>
            ) : null}
            <AppText variant="secondary" className="text-ink-muted">
              <AppText variant="secondary" className="font-bold text-ink">
                {cleaner.jobsCompleted}
              </AppText>{" "}
              jobs
            </AppText>
          </View>
          {cleaner.unavailableReason ? (
            <AppText variant="secondary" className="mt-0.5 text-status-warning-fg">
              {cleaner.unavailableReason}
            </AppText>
          ) : null}
        </View>
      </View>

      <View className="flex-row border-t border-border">
        <Pressable
          onPress={onViewProfile}
          accessibilityRole="button"
          accessibilityLabel={`View profile for ${cleaner.name}`}
          className="min-h-touch flex-1 items-center justify-center border-r border-border py-2.5 active:bg-surface-muted"
        >
          <AppText variant="secondary" className="font-semibold text-brand-600">
            View profile
          </AppText>
        </Pressable>
        <Pressable
          onPress={onChoose}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={selected ? `Selected ${cleaner.name}` : `Choose ${cleaner.name}`}
          accessibilityState={{ selected, disabled }}
          className="min-h-touch flex-1 items-center justify-center py-2.5 active:bg-surface-muted"
        >
          <AppText variant="secondary" className="font-semibold text-brand-600">
            {selected ? "Chosen" : "Choose me"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

type CleanerProps = {
  cleaners: AvailableCleanerV2[];
  loading: boolean;
  error: string | null;
  selectedIds: string[];
  cleanerCount: number;
  onCleanerCountChange: (n: number) => void;
  onToggle: (cleaner: AvailableCleanerV2) => void;
  onClearAll: () => void;
  needsLocation: boolean;
};

export function CleanerPicker({
  cleaners,
  loading,
  error,
  selectedIds,
  cleanerCount,
  onCleanerCountChange,
  onToggle,
  onClearAll,
  needsLocation,
}: CleanerProps) {
  const [profileCleaner, setProfileCleaner] = useState<AvailableCleanerV2 | null>(null);

  return (
    <View className="gap-3">
      <AppText variant="secondary" className="font-semibold text-ink">
        Cleaners
      </AppText>
      <AppText variant="secondary" className="text-ink-muted">
        Optional — leave empty for best available.
      </AppText>

      <View className="flex-row items-center gap-2">
        <AppText variant="secondary" className="text-ink-muted">
          Count
        </AppText>
        {[1, 2, 3].map((n) => {
          const on = cleanerCount === n;
          return (
            <Pressable
              key={n}
              onPress={() => onCleanerCountChange(n)}
              className={`min-w-[40px] items-center rounded-lg border px-3 py-2 ${
                on ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
              }`}
            >
              <AppText
                variant="body"
                className={`font-semibold ${on ? "text-brand-700" : "text-ink"}`}
              >
                {n}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={onClearAll}
        className={`rounded-xl border px-4 py-3 ${
          selectedIds.length === 0
            ? "border-brand-500 bg-brand-50"
            : "border-border bg-surface-card"
        }`}
      >
        <AppText variant="body" className="font-semibold text-ink">
          Best available cleaner
        </AppText>
        <AppText variant="secondary" className="text-ink-muted">
          We’ll assign someone for your slot
        </AppText>
      </Pressable>

      {needsLocation ? (
        <AppText
          variant="secondary"
          className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-ink-muted"
        >
          Confirm your suburb in Details to see cleaners for your area.
        </AppText>
      ) : null}
      {loading ? (
        <View className="flex-row items-center gap-2 py-3">
          <ActivityIndicator color={colors.brand[500]} size="small" />
          <AppText variant="secondary" className="text-ink-muted">
            Loading cleaners…
          </AppText>
        </View>
      ) : null}
      {error ? (
        <AppText variant="secondary" className="text-danger">
          {error}
        </AppText>
      ) : null}

      <View className="gap-2.5">
        {cleaners.slice(0, 12).map((c) => {
          const on = selectedIds.includes(c.id);
          const disabled = !c.isAvailable && !c.slotEligible;
          return (
            <CleanerCard
              key={c.id}
              cleaner={c}
              selected={on}
              disabled={disabled}
              onChoose={() => onToggle(c)}
              onViewProfile={() => setProfileCleaner(c)}
            />
          );
        })}
      </View>

      {!needsLocation && !loading && !error && cleaners.length === 0 ? (
        <AppText
          variant="secondary"
          className="rounded-xl border border-border bg-surface-muted px-4 py-3 text-danger"
        >
          No cleaners are free online right now. You can still reserve — we will assign a cleaner shortly.
        </AppText>
      ) : null}

      <CleanerProfileSheet
        cleaner={profileCleaner}
        visible={profileCleaner != null}
        selected={profileCleaner ? selectedIds.includes(profileCleaner.id) : false}
        chooseDisabled={
          profileCleaner
            ? !profileCleaner.isAvailable && !profileCleaner.slotEligible
            : true
        }
        onClose={() => setProfileCleaner(null)}
        onChoose={() => {
          if (profileCleaner) onToggle(profileCleaner);
        }}
      />
    </View>
  );
}
