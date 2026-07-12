import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "@shalean/mobile-ui";
import { CleanerAvatar } from "@/features/booking/components/CleanerAvatar";
import { useCleanerPublicProfile } from "@/features/booking/hooks/useCleanerPublicProfile";
import type { AvailableCleanerV2, CleanerBadge } from "@/services/types/bookingV2";
import { AppText, colors } from "@/theme";

type Props = {
  cleaner: AvailableCleanerV2 | null;
  visible: boolean;
  selected: boolean;
  chooseDisabled?: boolean;
  onClose: () => void;
  onChoose: () => void;
};

const BADGE_EXPERIENCE: Record<CleanerBadge, string> = {
  recommended: "Recommended by customers",
  top_rated: "Top rated cleaner",
  nearby: "Serves nearby areas",
  new: "New on Shalean",
};

function recommendPct(rating: number | null): number | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((rating / 5) * 100)));
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}

function experienceItems(cleaner: AvailableCleanerV2): string[] {
  const items: string[] = [];
  for (const badge of cleaner.badges) {
    const label = BADGE_EXPERIENCE[badge];
    if (label && !items.includes(label)) items.push(label);
  }
  if (cleaner.areasServed?.trim()) {
    items.push(`Serves ${cleaner.areasServed.trim()}`);
  }
  if (cleaner.slotEligible || cleaner.isAvailable) {
    items.push("Available for your selected slot");
  }
  if (cleaner.rating != null && cleaner.rating >= 4.5) {
    items.push("Consistently high customer ratings");
  }
  if (cleaner.jobsCompleted >= 50) {
    items.push("Experienced with many completed jobs");
  }
  return items.slice(0, 6);
}

function aboutBlurb(cleaner: AvailableCleanerV2): string {
  const name = firstName(cleaner.name);
  const jobs = cleaner.jobsCompleted;
  const areas = cleaner.areasServed?.trim();
  const parts = [
    `Hi, I'm ${name} — a professional cleaner with Shalean.`,
    jobs > 0 ? `I've completed ${jobs} job${jobs === 1 ? "" : "s"}` : null,
    areas ? `and work across ${areas}` : null,
  ].filter(Boolean);
  let text = parts.join(" ");
  if (!text.endsWith(".")) text += ".";
  text += " I take pride in reliable, thorough cleans and clear communication.";
  return text;
}

function formatReviewDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

/** SweepSouth-style cleaner profile sheet with live reviews + availability. */
export function CleanerProfileSheet({
  cleaner,
  visible,
  selected,
  chooseDisabled,
  onClose,
  onChoose,
}: Props) {
  const insets = useSafeAreaInsets();
  const profileQuery = useCleanerPublicProfile(cleaner?.id, visible && Boolean(cleaner?.id));
  const profile = profileQuery.data;

  if (!cleaner) return null;

  const rating = profile?.rating ?? cleaner.rating;
  const jobs = profile?.jobsCompleted ?? cleaner.jobsCompleted;
  const pct = recommendPct(rating);
  const experience = experienceItems({
    ...cleaner,
    areasServed: profile?.areasServed ?? cleaner.areasServed,
    rating,
    jobsCompleted: jobs,
  });
  const about = aboutBlurb({
    ...cleaner,
    areasServed: profile?.areasServed ?? cleaner.areasServed,
    jobsCompleted: jobs,
  });
  const reviews = profile?.reviews ?? [];
  const reviewCount = profile?.reviewCount ?? reviews.length;
  const weekdayLabels = profile?.availability.weekdayLabels ?? [];
  const hoursLabel =
    profile?.availability.startTime && profile?.availability.endTime
      ? `${profile.availability.startTime.slice(0, 5)} – ${profile.availability.endTime.slice(0, 5)}`
      : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Dismiss profile" />
        <View
          className="max-h-[88%] rounded-t-3xl bg-surface-card"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <AppText variant="section" className="text-ink">
              Cleaner profile
            </AppText>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-muted"
              hitSlop={8}
            >
              <Feather name="x" size={22} color={colors.ink.muted} />
            </Pressable>
          </View>

          <ScrollView
            className="px-4"
            contentContainerClassName="pb-4 pt-4"
            showsVerticalScrollIndicator={false}
          >
            <View className="mb-5 flex-row items-center gap-4">
              <CleanerAvatar size={64} backgroundColor={colors.brand[50]} />
              <AppText variant="title" className="min-w-0 flex-1 text-ink" numberOfLines={2}>
                {profile?.name ?? cleaner.name}
              </AppText>
            </View>

            <View className="mb-6 flex-row">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center gap-1.5">
                  <Feather name="thumbs-up" size={16} color={colors.ink.default} />
                  <AppText variant="section" className="text-ink">
                    {pct != null ? `${pct}%` : "—"}
                  </AppText>
                </View>
                <AppText variant="secondary" className="mt-1 text-brand-600">
                  {reviewCount > 0
                    ? `(${reviewCount} review${reviewCount === 1 ? "" : "s"})`
                    : rating != null && rating > 0
                      ? `${rating.toFixed(1)} rating`
                      : "Recommend"}
                </AppText>
              </View>
              <View className="flex-1 border-l border-border pl-3">
                <AppText variant="section" className="text-ink">
                  {jobs}
                </AppText>
                <AppText variant="secondary" className="mt-1 text-ink-muted">
                  Jobs Completed
                </AppText>
              </View>
            </View>

            <View className="mb-6">
              <AppText variant="section" className="mb-3 text-ink">
                Availability
              </AppText>
              {profileQuery.isLoading ? (
                <View className="flex-row items-center gap-2 py-2">
                  <ActivityIndicator color={colors.brand[500]} size="small" />
                  <AppText variant="secondary" className="text-ink-muted">
                    Loading availability…
                  </AppText>
                </View>
              ) : (
                <>
                  <View className="mb-2 flex-row items-center gap-2">
                    <View
                      className={`h-2.5 w-2.5 rounded-full ${
                        cleaner.slotEligible || profile?.isAvailable
                          ? "bg-status-success-fg"
                          : "bg-ink-subtle"
                      }`}
                    />
                    <AppText variant="body" className="text-ink">
                      {cleaner.slotEligible
                        ? "Available for your selected slot"
                        : profile?.isAvailable
                          ? "Generally available for bookings"
                          : "Limited availability"}
                    </AppText>
                  </View>
                  {weekdayLabels.length > 0 ? (
                    <View className="mb-2 flex-row flex-wrap gap-1.5">
                      {weekdayLabels.map((day) => (
                        <View
                          key={day}
                          className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1"
                        >
                          <AppText variant="label" className="font-semibold text-brand-700">
                            {day}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <AppText variant="secondary" className="text-ink-muted">
                      Usual working days not listed yet.
                    </AppText>
                  )}
                  {hoursLabel ? (
                    <AppText variant="secondary" className="text-ink-muted">
                      Typical hours {hoursLabel}
                    </AppText>
                  ) : null}
                </>
              )}
            </View>

            {experience.length > 0 ? (
              <View className="mb-6">
                <AppText variant="section" className="mb-3 text-ink">
                  Experience
                </AppText>
                <View className="gap-2.5">
                  {experience.map((item) => (
                    <View key={item} className="flex-row items-start gap-2.5">
                      <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-brand-500">
                        <Feather name="check" size={12} color="#fff" />
                      </View>
                      <AppText variant="body" className="flex-1 text-ink">
                        {item}
                      </AppText>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="mb-6">
              <AppText variant="section" className="mb-2 text-ink">
                About Me
              </AppText>
              <AppText variant="body" className="leading-6 text-ink-muted">
                {about}
              </AppText>
            </View>

            <View className="mb-2">
              <AppText variant="section" className="mb-3 text-ink">
                Reviews
              </AppText>
              {profileQuery.isLoading ? (
                <View className="flex-row items-center gap-2 py-2">
                  <ActivityIndicator color={colors.brand[500]} size="small" />
                  <AppText variant="secondary" className="text-ink-muted">
                    Loading reviews…
                  </AppText>
                </View>
              ) : reviews.length === 0 ? (
                <AppText variant="secondary" className="text-ink-muted">
                  No public reviews yet. Ratings still reflect completed jobs.
                </AppText>
              ) : (
                <View className="gap-3">
                  {reviews.map((review) => (
                    <View
                      key={review.id}
                      className="rounded-xl border border-border bg-surface px-3 py-3"
                    >
                      <View className="mb-1 flex-row items-center justify-between gap-2">
                        <AppText variant="body" className="font-semibold text-ink">
                          {review.reviewerName}
                        </AppText>
                        <View className="flex-row items-center gap-1">
                          <Feather name="star" size={12} color={colors.brand[500]} />
                          <AppText variant="secondary" className="font-semibold text-ink">
                            {review.rating.toFixed(1)}
                          </AppText>
                        </View>
                      </View>
                      {review.comment ? (
                        <AppText variant="secondary" className="leading-5 text-ink-muted">
                          {review.comment}
                        </AppText>
                      ) : (
                        <AppText variant="secondary" className="text-ink-subtle">
                          No written comment
                        </AppText>
                      )}
                      {formatReviewDate(review.createdAt) ? (
                        <AppText variant="label" className="mt-1 text-ink-subtle">
                          {formatReviewDate(review.createdAt)}
                        </AppText>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {cleaner.unavailableReason ? (
              <AppText variant="secondary" className="mt-3 text-status-warning-fg">
                {cleaner.unavailableReason}
              </AppText>
            ) : null}
            {profileQuery.isError ? (
              <AppText variant="secondary" className="mt-2 text-status-warning-fg">
                Couldn’t refresh reviews and availability. Showing picker details instead.
              </AppText>
            ) : null}
          </ScrollView>

          <View className="flex-row gap-3 border-t border-border px-4 pt-3">
            <View className="flex-1">
              <AppButton
                label={selected ? "Chosen" : "Choose me"}
                onPress={() => {
                  onChoose();
                  onClose();
                }}
                disabled={chooseDisabled || selected}
              />
            </View>
            <View className="flex-1">
              <AppButton label="Close" variant="secondary" onPress={onClose} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
