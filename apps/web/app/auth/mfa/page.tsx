import { redirect } from "next/navigation";

import { MfaForm } from "./MfaForm";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeRedirect(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "/office";
  return value;
}

export default async function MfaPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const redirectTo = safeRedirect(firstParam(params.redirect));

  if (!redirectTo.startsWith("/office")) {
    redirect("/office");
  }

  return <MfaForm redirect={redirectTo} />;
}
