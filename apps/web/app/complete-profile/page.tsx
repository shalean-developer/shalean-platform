"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthCard } from "@/components/auth/AuthShell";
import { signOut } from "@/lib/auth/authClient";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function CompleteProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    void sb?.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? null);
    });
  }, [router]);

  return (
    <AuthCard>
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Complete your profile</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        We could not find an account profile{email ? ` for ${email}` : ""}. Finish setup or contact support if this
        keeps happening.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Link
          href="/auth/signup"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        >
          Create account
        </Link>
        <button
          type="button"
          className="rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          onClick={() => void signOut().then(() => router.replace("/login"))}
        >
          Sign out
        </button>
      </div>
    </AuthCard>
  );
}
