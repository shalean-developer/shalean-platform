import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthAdminPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const redirectParam = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;
  const redirectTo =
    redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")
      ? redirectParam
      : "/office";
  redirect(`/admin/login?redirect=${encodeURIComponent(redirectTo)}`);
}
