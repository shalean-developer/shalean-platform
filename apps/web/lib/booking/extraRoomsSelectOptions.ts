export type BookingSelectOption = { value: string; label: string };

export const BEDROOM_SELECT_OPTIONS: BookingSelectOption[] = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: `${n} bedroom${n > 1 ? "s" : ""}`,
}));

export const BATHROOM_SELECT_OPTIONS: BookingSelectOption[] = [1, 2, 3].map((n) => ({
  value: String(n),
  label: `${n} bathroom${n > 1 ? "s" : ""}`,
}));

/** Values 0–5; label for `5` is “5+” (pricing uses 5 × extra-room rate). */
export const EXTRA_ROOMS_SELECT_OPTIONS: BookingSelectOption[] = [
  { value: "0", label: "0 extra rooms" },
  { value: "1", label: "1 extra room" },
  { value: "2", label: "2 extra rooms" },
  { value: "3", label: "3 extra rooms" },
  { value: "4", label: "4 extra rooms" },
  { value: "5", label: "5+ extra rooms" },
];
