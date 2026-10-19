import { Text } from "react-native";
import type { CleanerJobWire } from "../../services/types/cleanerJobs";
import { acceptanceOverdueMessage } from "../../lib/jobs/acceptanceOverdueMessage";

/** Only pending active assignments display a server-confirmed overdue warning. */
export function AcceptanceOverdueNotice({ job }: { job: CleanerJobWire }) {
  const message = acceptanceOverdueMessage(job);
  if (!message) return null;
  return (
    <Text className="mx-4 my-2 rounded-lg bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg" accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}
