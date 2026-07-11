import { ActivityIndicator, Alert, Text, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { actionLabel, deriveCleanerJobActions } from "@/lib/jobs/deriveCleanerJobActions";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useJobLifecycleMutation } from "@/hooks/useJobActions";
import { useConnectivity } from "@/providers/ConnectivityProvider";
import type { CleanerJobWire, CleanerLifecycleAction } from "@/services/types/cleanerJobs";
import { colors } from "@/theme";

type Props = { job: CleanerJobWire };

export function JobActionBar({ job }: Props) {
  const actions = deriveCleanerJobActions(job);
  const mutation = useJobLifecycleMutation(job.id);
  const { isOnline } = useConnectivity();

  const run = (action: CleanerLifecycleAction, confirm?: string) => {
    const execute = () => {
      mutation.mutate(action, {
        onSuccess: (result) => {
          if (result.queued) {
            Alert.alert(
              "Saved for when you're online",
              `${actionLabel(action)} will sync automatically when connectivity returns.`,
            );
          }
        },
        onError: (err) => {
          Alert.alert("Action failed", friendlyErrorMessage(err));
        },
      });
    };

    if (confirm) {
      Alert.alert(actionLabel(action), confirm, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: action === "reject" ? "destructive" : "default", onPress: execute },
      ]);
      return;
    }
    execute();
  };

  const buttons: {
    action: CleanerLifecycleAction;
    show: boolean;
    destructive?: boolean;
    confirm?: string;
  }[] = [
    { action: "accept", show: actions.accept },
    { action: "reject", show: actions.reject, destructive: true, confirm: "Decline this job assignment?" },
    { action: "en_route", show: actions.enRoute },
    { action: "start", show: actions.start },
    { action: "complete", show: actions.complete, confirm: "Mark this job as complete?" },
  ];

  const visible = buttons.filter((b) => b.show);
  if (visible.length === 0) {
    return (
      <View className="rounded-xl bg-surface-muted px-4 py-3">
        <Text className="text-center text-sm text-ink-muted">
          No actions available for this job right now.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {!isOnline ? (
        <Text className="mb-1 text-center text-xs text-ink-muted" accessibilityLiveRegion="polite">
          Offline — actions will queue and sync later
        </Text>
      ) : null}
      {mutation.isPending ? (
        <View className="items-center py-1" accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      ) : null}
      {visible.map((b) => (
        <AppButton
          key={b.action}
          label={actionLabel(b.action)}
          disabled={mutation.isPending}
          variant={b.destructive ? "danger" : "primary"}
          onPress={() => run(b.action, b.confirm)}
        />
      ))}
    </View>
  );
}
