/** Console warn in development only — skips production and Vitest (`NODE_ENV=test`). */
export function devWarn(...args: unknown[]): void {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return;
  console.warn(...args);
}
