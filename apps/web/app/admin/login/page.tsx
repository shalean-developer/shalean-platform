import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminLoginAliasPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const redirectParam = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;
  const redirectTo = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/admin";
  redirect(`/login?role=admin&redirect=${encodeURIComponent(redirectTo)}`);
}
