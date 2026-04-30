"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    const sb = getSupabaseBrowser();
    try {
      await sb?.auth.signOut();
    } catch {
      /* still clear local session */
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("cleaner_id");
    }
    router.replace("/cleaner/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="h-11 w-full rounded-xl border-zinc-200 bg-transparent text-base font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
      onClick={() => void logout()}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      Log out
    </Button>
  );
}
