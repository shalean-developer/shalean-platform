import { remapAdminPathToOffice } from "@/lib/admin/remapAdminPathToOffice";
import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function remapAdminRedirectTarget(redirectParam: string): string {
  const qIndex = redirectParam.indexOf("?");
  const pathPart = qIndex >= 0 ? redirectParam.slice(0, qIndex) : redirectParam;
  const queryPart = qIndex >= 0 ? redirectParam.slice(qIndex) : "";
  return `${remapAdminPathToOffice(pathPart)}${queryPart}`;
}

export default async function AuthAdminPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const redirectParam = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;
  const redirectTo =
    redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")
      ? remapAdminRedirectTarget(redirectParam)
      : "/office";
  redirect(`/login?role=admin&redirect=${encodeURIComponent(redirectTo)}`);
}
