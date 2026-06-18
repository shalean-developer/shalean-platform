import { redirect } from "next/navigation";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy `/signup` → canonical auth signup. */
export default async function SignupRedirectPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value[0]) q.set(key, value[0]);
    } else if (value) {
      q.set(key, value);
    }
  }
  const suffix = q.toString();
  redirect(suffix ? `/auth/signup?${suffix}` : "/auth/signup");
}
