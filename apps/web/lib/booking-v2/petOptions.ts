export const PET_OPTIONS = [
  { value: "no", label: "No pets" },
  { value: "dogs", label: "Dogs" },
  { value: "cats", label: "Cats" },
  { value: "dogs_and_cats", label: "Dogs & Cats" },
  { value: "snakes", label: "Snakes" },
  { value: "lizards", label: "Lizards" },
] as const;

export function petAnswerLabel(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No pets";
  return PET_OPTIONS.find((option) => option.value === normalized)?.label ?? String(value ?? "");
}
