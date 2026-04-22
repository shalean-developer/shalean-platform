import "server-only";

export function isAdmin(email?: string | null) {
  if (!email) return false;

  const admins = process.env.ADMIN_EMAILS?.split(",") || [];

  return admins
    .map((e) => e.trim().toLowerCase())
    .includes(email.toLowerCase());
}
