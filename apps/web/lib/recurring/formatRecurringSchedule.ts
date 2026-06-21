const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function frequencyLabel(f: string): string {
  const x = f.toLowerCase();
  if (x === "weekly") return "Weekly";
  if (x === "biweekly" || x === "fortnightly") return "Bi-weekly";
  if (x === "monthly") return "Monthly";
  return f || "—";
}

export function formatDaysOfWeek(days: number[]): string {
  const uniq = [...new Set(days.filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  if (uniq.length === 0) return "";
  return uniq.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

function ordinal(n: number): string {
  const v = Math.max(1, Math.min(4, Math.round(n)));
  return ["First", "Second", "Third", "Fourth"][v - 1] ?? `${v}th`;
}

export function formatMonthlyPatternLine(
  daysOfWeek: number[],
  monthlyPattern: string | null | undefined,
  monthlyNth: number | null | undefined,
  startDate: string | null | undefined,
): string {
  const days = formatDaysOfWeek(daysOfWeek);
  const pattern = (monthlyPattern ?? "mirror_start_date").toLowerCase();
  if (pattern === "nth_weekday" && monthlyNth != null && days) {
    return `${ordinal(monthlyNth)} ${days} each month`;
  }
  if (pattern === "last_weekday" && days) {
    return `Last ${days} each month`;
  }
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const dom = Number(startDate.slice(8, 10));
    if (Number.isFinite(dom) && dom >= 1) return `Day ${dom} each month`;
  }
  return days ? `Monthly on ${days}` : "Monthly";
}

export function formatRecurringScheduleLine(input: {
  frequency: string;
  days_of_week: number[];
  monthly_pattern?: string | null;
  monthly_nth?: number | null;
  start_date?: string | null;
  template_visit_time?: string | null;
}): string {
  const freq = frequencyLabel(input.frequency);
  const time =
    input.template_visit_time && /^\d{2}:\d{2}/.test(input.template_visit_time.trim())
      ? input.template_visit_time.trim().slice(0, 5)
      : null;

  let dayPart = "";
  if (input.frequency.toLowerCase() === "monthly") {
    dayPart = formatMonthlyPatternLine(
      input.days_of_week,
      input.monthly_pattern,
      input.monthly_nth,
      input.start_date,
    );
  } else {
    dayPart = formatDaysOfWeek(input.days_of_week);
  }

  return [freq, dayPart || null, time].filter(Boolean).join(" · ");
}
