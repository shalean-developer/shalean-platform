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

/** Triggers a browser download of the given CSV string. Safe no-op outside the browser. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
