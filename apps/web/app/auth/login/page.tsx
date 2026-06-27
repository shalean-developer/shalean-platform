import { redirect } from "next/navigation";

import { parseLoginSearchParams } from "@/lib/auth/sanitizeLoginSearchParams";

import { LoginFormClient } from "./LoginFormClient";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeInAppRedirect(raw: string | undefined, fallback: string): string {
  const t = (raw ?? "").trim();
  if (t.startsWith("/") && !t.startsWith("//") && !t.includes("://")) return t;
  return fallback;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const parsed = parseLoginSearchParams(params);

  if (parsed.hasPasswordInQuery) {
    redirect(`/auth/login${parsed.safeSearch}`);
  }

  const redirectTo = safeInAppRedirect(firstParam(params.redirect), "/account");
  const intent = firstParam(params.intent) ?? null;

  return (
    <LoginFormClient
      initialEmail={parsed.emailPrefill ?? ""}
      stripCredentialsFromUrl={parsed.shouldStripCredentialsFromUrl}
      redirect={redirectTo}
      intent={intent}
    />
  );
}
