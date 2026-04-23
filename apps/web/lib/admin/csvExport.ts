/**
 * Minimal CSV builder (RFC-style quoting). Avoids extra dependencies.
 */
export function escapeCsvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const head = headers.map(escapeCsvCell).join(",");
  const body = rows
    .map((row) => headers.map((h) => escapeCsvCell(row[h])).join(","))
    .join("\r\n");
  return `${head}\r\n${body}`;
}
