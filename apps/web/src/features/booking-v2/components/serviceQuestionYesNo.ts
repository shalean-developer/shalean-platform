import type { FormQuestion } from "@/src/features/booking-v2/config/serviceConfig";

export function isYesNoQuestion(question: FormQuestion): boolean {
  if (question.type !== "radio") return false;
  const opts = question.options ?? [];
  if (opts.length !== 2) return false;
  const values = new Set(opts.map((o) => o.value.trim().toLowerCase()));
  return values.has("yes") && values.has("no");
}
