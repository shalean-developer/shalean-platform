/** Lowercase + trim for storage and comparisons (matches auth.users email style). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
