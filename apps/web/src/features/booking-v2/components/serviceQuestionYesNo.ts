import type { FormQuestion } from "@/src/features/booking-v2/config/serviceConfig";

export function isYesNoQuestion(question: FormQuestion): boolean {
  if (question.type !== "radio") return false;
  const opts = question.options ?? [];
  if (opts.length !== 2) return false;
  const values = new Set(opts.map((o) => o.value.trim().toLowerCase()));
  return values.has("yes") && values.has("no");
}

/** Whether a stored yes/no answer is present (string or legacy boolean). */
export function isYesNoAnswered(value: unknown): boolean {
  return value === "yes" || value === "no" || value === true || value === false;
}

/** Normalize toggle values to "yes" | "no"; empty/null defaults to "no" (matches toggle UI). */
export function coerceYesNoValue(value: unknown, defaultWhenEmpty: "yes" | "no" = "no"): "yes" | "no" {
  if (value === true || value === "yes") return "yes";
  if (value === false || value === "no") return "no";
  return defaultWhenEmpty;
}

export function validateYesNoRequired(value: unknown, label: string): true | string {
  return isYesNoAnswered(value) ? true : `${label} is required`;
}
