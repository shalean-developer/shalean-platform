import { Text, View } from "react-native";
import {
  JOB_LIFECYCLE_STEPS,
  jobLifecycleStepIndex,
} from "@/lib/jobs/jobDisplay";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

type Props = { job: CleanerJobWire };

/** Visual Assigned → Accepted → En route → In progress → Done stepper. */
export function JobProgressStepper({ job }: Props) {
  const active = jobLifecycleStepIndex(job);
  const cancelled = active < 0;

  return (
    <View
      className="rounded-2xl border border-border bg-surface-card px-3 py-4"
      accessibilityRole="progressbar"
      accessibilityLabel={
        cancelled
          ? "Job cancelled or declined"
          : `Job progress: ${JOB_LIFECYCLE_STEPS[Math.min(active, 4)]?.label ?? "Assigned"}`
      }
      accessibilityValue={{ min: 0, max: 4, now: cancelled ? 0 : Math.min(active, 4) }}
    >
      <Text className="mb-3 px-1 text-overline font-semibold uppercase tracking-wide text-ink-muted">
        Progress
      </Text>
      {cancelled ? (
        <Text className="px-1 text-sm text-danger">This job is no longer active.</Text>
      ) : (
        <View className="flex-row items-start justify-between">
          {JOB_LIFECYCLE_STEPS.map((step, index) => {
            const done = index < active;
            const current = index === active;
            const upcoming = index > active;
            const dotColor = done || current ? colors.brand[500] : colors.surface.muted;
            const labelColor = upcoming ? colors.ink.subtle : colors.ink.default;

            return (
              <View key={step.key} className="flex-1 items-center">
                <View className="mb-2 w-full flex-row items-center">
                  {index > 0 ? (
                    <View
                      className="h-0.5 flex-1"
                      style={{
                        backgroundColor: index <= active ? colors.brand[500] : colors.surface.muted,
                      }}
                    />
                  ) : (
                    <View className="flex-1" />
                  )}
                  <View
                    className="mx-0.5 h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: dotColor,
                      borderWidth: current ? 2 : 0,
                      borderColor: colors.brand[200],
                      transform: [{ scale: current ? 1.25 : 1 }],
                    }}
                  />
                  {index < JOB_LIFECYCLE_STEPS.length - 1 ? (
                    <View
                      className="h-0.5 flex-1"
                      style={{
                        backgroundColor: index < active ? colors.brand[500] : colors.surface.muted,
                      }}
                    />
                  ) : (
                    <View className="flex-1" />
                  )}
                </View>
                <Text
                  className="px-0.5 text-center text-[10px] font-medium"
                  style={{ color: labelColor }}
                  numberOfLines={2}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
