import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { OfflineBanner } from "@/components/OfflineBanner";
import { AppButton } from "@/components/ui/AppButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { useSubmitCleanerFeedback } from "@/hooks/useCleanerEngagement";
import { friendlyErrorMessage } from "@/lib/errors/apiErrorMessage";
import { useToast } from "@/providers/ToastProvider";
import { colors } from "@/theme";

const FEEDBACK_SUBJECTS = [
  "App experience",
  "Scheduling",
  "Payouts",
  "Support",
  "General suggestion",
  "Other",
] as const;

const REPORT_SUBJECTS = [
  "Harassment or bullying",
  "Safety concern",
  "Unfair treatment",
  "Policy violation",
  "Other",
] as const;

/** Submit feedback or a sensitive report via /api/cleaner/report-feedback. */
export default function FeedbackScreen() {
  const { showToast } = useToast();
  const mutation = useSubmitCleanerFeedback();
  const [mode, setMode] = useState<"feedback" | "report">("feedback");
  const [subject, setSubject] = useState<string>(FEEDBACK_SUBJECTS[0]);
  const [message, setMessage] = useState("");

  const subjects = useMemo(
    () => (mode === "feedback" ? FEEDBACK_SUBJECTS : REPORT_SUBJECTS),
    [mode],
  );

  const onModeChange = (next: "feedback" | "report") => {
    setMode(next);
    setSubject(next === "feedback" ? FEEDBACK_SUBJECTS[0] : REPORT_SUBJECTS[0]);
  };

  const onSubmit = () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      Alert.alert("Add more detail", "Please write at least 10 characters.");
      return;
    }
    mutation.mutate(
      {
        submission_type: mode,
        subject,
        message: trimmed,
      },
      {
        onSuccess: () => {
          setMessage("");
          showToast(mode === "report" ? "Report submitted" : "Thanks for your feedback", "success");
        },
        onError: (err) => Alert.alert("Could not submit", friendlyErrorMessage(err)),
      },
    );
  };

  return (
    <View className="flex-1 bg-surface">
      <OfflineBanner />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-10 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row gap-2">
          {(["feedback", "report"] as const).map((m) => {
            const selected = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => onModeChange(m)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`min-h-10 flex-1 items-center justify-center rounded-xl border ${
                  selected ? "border-brand-500 bg-brand-50" : "border-border bg-surface-card"
                }`}
              >
                <Text
                  className={`text-sm font-semibold capitalize ${
                    selected ? "text-brand-600" : "text-ink-muted"
                  }`}
                >
                  {m}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionCard title="Topic">
          <View className="flex-row flex-wrap gap-2">
            {subjects.map((s) => {
              const selected = subject === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSubject(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`rounded-lg border px-3 py-2 ${
                    selected ? "border-brand-500 bg-brand-50" : "border-border bg-surface"
                  }`}
                >
                  <Text
                    className={`text-sm ${selected ? "font-semibold text-brand-600" : "text-ink-muted"}`}
                  >
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard title="Message">
          <TextInput
            className="min-h-[140px] rounded-xl border border-border bg-surface px-3 py-3 text-base text-ink"
            multiline
            textAlignVertical="top"
            placeholder="Tell us what happened or what we can improve…"
            placeholderTextColor={colors.ink.muted}
            value={message}
            onChangeText={setMessage}
            editable={!mutation.isPending}
            accessibilityLabel="Feedback message"
          />
          <Text className="mt-2 text-caption text-ink-muted">
            {mode === "report"
              ? "Reports are reviewed by ops. Do not include customer passwords."
              : "Feedback helps us improve the cleaner app."}
          </Text>
        </SectionCard>

        <AppButton
          label={mode === "report" ? "Submit report" : "Send feedback"}
          onPress={onSubmit}
          loading={mutation.isPending}
          disabled={mutation.isPending}
        />
      </ScrollView>
    </View>
  );
}
