import { redirect } from "next/navigation";
import { AuthRoleChoiceScreen } from "@/components/auth/AuthRoleChoiceScreen";
import { AuthLegalFooter } from "@/components/auth/AuthShell";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeInAppRedirect(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return "";
  return t;
}

/** Server-side role routing — avoids client `useSearchParams` hydration mismatch on `/login?role=…`. */
export default async function RoleLoginRouterPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const roleRaw = firstParam(params.role);
  const roleNorm = (roleRaw ?? "").toLowerCase();
  const safeRedirectPath = safeInAppRedirect(firstParam(params.redirect));

  if (roleNorm === "cleaner") {
    const target = safeRedirectPath.startsWith("/jobs") ? safeRedirectPath : "/jobs";
    redirect(`/cleaner/login?redirect=${encodeURIComponent(target)}`);
  }

  if (roleNorm === "admin") {
    const target = safeRedirectPath || "/office";
    redirect(`/auth/login?redirect=${encodeURIComponent(target)}&intent=customer`);
  }

  if (roleNorm === "customer") {
    const target = safeRedirectPath || "/account";
    redirect(`/auth/login?redirect=${encodeURIComponent(target)}&intent=customer`);
  }

  return (
    <>
      <AuthRoleChoiceScreen redirect={safeRedirectPath || null} />
      <AuthLegalFooter />
    </>
  );
}
