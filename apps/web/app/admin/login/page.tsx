import { redirect } from "next/navigation";

export const metadata = {
  title: "Admin Login | Shalean Cleaning Services",
  description:
    "Secure admin login portal for managing bookings, cleaners, customers, and operations at Shalean Cleaning Services.",
};

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminLoginAliasPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};

  const redirectParam = Array.isArray(params.redirect)
    ? params.redirect[0]
    : params.redirect;

  const redirectTo =
    redirectParam && redirectParam.startsWith("/")
      ? redirectParam
      : "/office";

  redirect(
    `/login?role=admin&redirect=${encodeURIComponent(redirectTo)}`
  );
}