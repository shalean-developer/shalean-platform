import "server-only";

function adminEmailList(): string[] {
  const fromList = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const single = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (single && !fromList.includes(single)) return [...fromList, single];
  return fromList;
}

export function isAdmin(email?: string | null) {
  if (!email) return false;
  const admins = adminEmailList();
  return admins.includes(email.toLowerCase());
}
