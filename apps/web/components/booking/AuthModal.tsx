"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type AuthModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "login" | "signup";
  prefillEmail?: string;
  prefillName?: string;
  prefillPhone?: string;
  onAuthenticated: (session: {
    id: string;
    accessToken: string;
    email?: string;
    name?: string;
    phone?: string;
  }) => void;
};

export function AuthModal({
  open,
  onOpenChange,
  defaultTab = "login",
  prefillEmail = "",
  prefillName = "",
  prefillPhone = "",
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">(defaultTab);
  const [name, setName] = useState(prefillName);
  const [phone, setPhone] = useState(prefillPhone);
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Sign-in is currently unavailable.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError || !data.session?.user) {
          setError(signInError?.message ?? "Could not sign in.");
          return;
        }
        onAuthenticated({
          id: data.session.user.id,
          accessToken: data.session.access_token,
          email: data.session.user.email ?? email.trim(),
          name,
          phone,
        });
        onOpenChange(false);
        return;
      }

      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), phone: phone.trim() } },
      });
      if (signUpError || !data.session?.user) {
        setError(signUpError?.message ?? "Could not create your account.");
        return;
      }
      onAuthenticated({
        id: data.session.user.id,
        accessToken: data.session.access_token,
        email: data.session.user.email ?? email.trim(),
        name: name.trim(),
        phone: phone.trim(),
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Continue your booking</DialogTitle>
          <DialogDescription>Login or sign up to confirm your booking</DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
          <TabsList>
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form className="space-y-3" onSubmit={onSubmit}>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950"
              />
              {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="h-10 w-full rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Please wait…" : "Continue"}
              </button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form className="space-y-3" onSubmit={onSubmit}>
              <input
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950"
              />
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6)"
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-950"
              />
              {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="h-10 w-full rounded-lg bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Please wait…" : "Create account & continue"}
              </button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

