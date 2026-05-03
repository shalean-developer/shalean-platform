"use client";

import { useSearchParams } from "next/navigation";
import { AuthRoleChoiceScreen } from "@/components/auth/AuthRoleChoiceScreen";

export function AuthRoleChoicePageClient() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect")?.trim() || null;
  return <AuthRoleChoiceScreen redirect={redirect} />;
}
