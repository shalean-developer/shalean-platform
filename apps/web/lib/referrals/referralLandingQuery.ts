export function referralCodeFromSearchParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const code = raw?.trim().toUpperCase() ?? "";
  return code || null;
}
