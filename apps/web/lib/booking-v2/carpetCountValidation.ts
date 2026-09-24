export function canonicalCarpetCount(
  value: unknown,
  options: { min: number; max: number },
): number | null {
  let parsed: number;

  if (typeof value === "number") {
    if (!Number.isInteger(value)) return null;
    parsed = value;
  } else if (typeof value === "string") {
    // Keep quote/confirm semantics identical to the decimal quantities emitted
    // by the Booking V2 controls. Reject alternate JS numeric spellings such as
    // exponent/hex notation and capped UI pseudo-values (e.g. "6+").
    if (!/^(0|[1-9]\d*)$/.test(value)) return null;
    parsed = Number.parseInt(value, 10);
  } else {
    return null;
  }

  return parsed >= options.min && parsed <= options.max ? parsed : null;
}
