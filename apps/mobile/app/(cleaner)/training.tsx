import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { ErrorState, LoadingState } from "@/components/ui/StateViews";
import { TRAINING_MODULES } from "@/constants/helpContent";
import { useCleanerTrainingCompliance } from "@/hooks/useCleanerTrainingCompliance";
import type {
  CleanerTrainingAssignmentWire,
  CleanerTrainingModuleWire,
} from "@/services/types/cleanerTrainingCompliance";

function dateLabel(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-ZA", { dateStyle: "medium" });
}

function assignmentForModule(
  assignments: CleanerTrainingAssignmentWire[],
  moduleId: string,
): CleanerTrainingAssignmentWire | null {
  return assignments.find((row) => row.module_id === moduleId) ?? null;
}

function statusText(module: CleanerTrainingModuleWire, assignment: CleanerTrainingAssignmentWire | null): string {
  if (!assignment) return module.isRequired ? "Required · not assigned" : "Optional · not assigned";
  const status = assignment.status.replaceAll("_", " ");
  if (assignment.status === "completed" && assignment.expires_at) {
    return `Completed · valid until ${dateLabel(assignment.expires_at)}`;
  }
  if (assignment.due_at && !["completed", "waived"].includes(assignment.status)) {
    return `${status} · due ${dateLabel(assignment.due_at)}`;
  }
  return status;
}

/** Cleaner training and compliance — canonical assigned status first, tips second. */
export default function TrainingScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useCleanerTrainingCompliance();

  if (isLoading && !data) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <LoadingState label="Loading training…" />
      </View>
    );
  }

  if (isError && !data) {
    return (
      <View className="flex-1 bg-surface">
        <OfflineBanner />
        <ErrorState
          title="Could not load training"
          message={error instanceof Error ? error.message : "Training status is unavailable."}
          onRetry={() => void refetch()}
        />
      </View>
    );
  }

  const cleaner = data?.cleaner;
  const assignments = data?.assignments ?? [];
  const modules = data?.modules ?? [];
  const compliance = data?.compliance ?? [];

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView contentContainerClassName="gap-3 px-4 pb-10 pt-2">
        <SectionCard title="Readiness">
          <Text className={`text-base font-semibold ${cleaner?.ready ? "text-success" : "text-warning"}`}>
            {cleaner?.ready ? "Training and compliance current" : "Action needed"}
          </Text>
          <Text className="mt-2 text-sm text-ink-muted">
            {cleaner?.overdueTraining ?? 0} training item{(cleaner?.overdueTraining ?? 0) === 1 ? "" : "s"} overdue or missing · {cleaner?.nonCompliant ?? 0} compliance item{(cleaner?.nonCompliant ?? 0) === 1 ? "" : "s"} needing attention
          </Text>
          {cleaner?.missingComplianceEvidence ? (
            <Text className="mt-2 text-sm text-warning">
              Compliance evidence has not been added yet, so readiness cannot be confirmed.
            </Text>
          ) : null}
        </SectionCard>

        <SectionCard title="Assigned training">
          {modules.length === 0 ? (
            <Text className="text-sm text-ink-muted">No training modules are currently published.</Text>
          ) : (
            <View className="gap-3">
              {modules.map((module) => {
                const assignment = assignmentForModule(assignments, module.id);
                return (
                  <View key={module.id} className="rounded-xl border border-border p-3">
                    <Text className="text-sm font-semibold text-ink">{module.title}</Text>
                    <Text className="mt-1 text-caption text-ink-muted">{statusText(module, assignment)}</Text>
                    {assignment?.score != null ? (
                      <Text className="mt-1 text-caption text-ink-muted">Score: {Math.round(assignment.score)}%</Text>
                    ) : null}
                    {module.description ? (
                      <Text className="mt-2 text-sm leading-5 text-ink-muted">{module.description}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </SectionCard>

        <SectionCard title="Compliance">
          {compliance.length === 0 ? (
            <Text className="text-sm text-ink-muted">No compliance records have been added yet.</Text>
          ) : (
            <View className="gap-3">
              {compliance.map((row) => (
                <View key={row.id} className="rounded-xl border border-border p-3">
                  <Text className="text-sm font-semibold text-ink">{row.requirement_label}</Text>
                  <Text className="mt-1 text-caption text-ink-muted">
                    {row.status.replaceAll("_", " ")}{row.expires_at ? ` · expires ${dateLabel(row.expires_at)}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        <SectionCard title="Training tips">
          <Text className="mb-3 text-sm text-ink-muted">
            These quick guides support your formal assigned training; they do not replace required completion or verification.
          </Text>
          <View className="gap-3">
            {TRAINING_MODULES.map((mod, index) => (
              <View key={mod.id} className="rounded-xl border border-border p-3">
                <Text className="text-caption font-semibold uppercase text-ink-muted">Guide {index + 1}</Text>
                <Text className="mt-1 text-base font-semibold text-ink">{mod.title}</Text>
                <Text className="mt-2 text-sm leading-5 text-ink-muted">{mod.summary}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <AppButton
          label="Open help centre"
          variant="secondary"
          onPress={() => router.push("/(cleaner)/help" as Href)}
        />
      </ScrollView>
    </View>
  );
}
