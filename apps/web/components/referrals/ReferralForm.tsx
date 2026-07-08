"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfettiCelebration } from "@/components/referrals/ConfettiCelebration";

type Props = {
  rewardAmountZar: number;
  onSuccess?: () => void;
};

type FormState = {
  referrerName: string;
  referrerPhone: string;
  referrerEmail: string;
  friendName: string;
  friendPhone: string;
  friendEmail: string;
  message: string;
};

const INITIAL: FormState = {
  referrerName: "",
  referrerPhone: "",
  referrerEmail: "",
  friendName: "",
  friendPhone: "",
  friendEmail: "",
  message: "",
};

export function ReferralForm({ rewardAmountZar, onSuccess }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setServerError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setServerError(null);

    const res = await fetch("/api/referrals/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = (await res.json()) as { error?: string; field?: string; success?: boolean };

    if (!res.ok) {
      if (json.field && json.field in INITIAL) {
        setErrors({ [json.field as keyof FormState]: json.error });
      }
      setServerError(json.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setShowConfetti(true);
    setForm(INITIAL);
    setSubmitting(false);
    onSuccess?.();
  }

  if (success) {
    return (
      <>
        <ConfettiCelebration active={showConfetti} />
        <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h3 className="mt-5 text-2xl font-bold text-gray-900">Referral submitted!</h3>
          <p className="mt-2 text-sm text-gray-600">
            Thank you for spreading the word. When your friend completes their first paid cleaning,
            you&apos;ll receive <strong>R {rewardAmountZar}</strong> Cleaning Credit towards your next booking.
          </p>
          <p className="mt-4 text-xs text-gray-500">
            Rewards are issued as Cleaning Credit only, not cash, after their first booking is completed and fully paid.
          </p>
          <Button
            type="button"
            className="mt-6 rounded-xl"
            variant="outline"
            onClick={() => { setSuccess(false); setShowConfetti(false); }}
          >
            Refer another friend
          </Button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-lg sm:p-8">
      <div>
        <h3 className="text-xl font-bold text-gray-900">Refer a friend</h3>
        <p className="mt-1 text-sm text-gray-500">Fill in your details and your friend&apos;s contact information.</p>
      </div>

      {serverError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="referrerName">Your name</Label>
          <Input id="referrerName" value={form.referrerName} onChange={(e) => setField("referrerName", e.target.value)} required />
          {errors.referrerName ? <p className="text-xs text-red-600">{errors.referrerName}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="referrerPhone">Your phone</Label>
          <Input id="referrerPhone" type="tel" value={form.referrerPhone} onChange={(e) => setField("referrerPhone", e.target.value)} required />
          {errors.referrerPhone ? <p className="text-xs text-red-600">{errors.referrerPhone}</p> : null}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="referrerEmail">Your email</Label>
          <Input id="referrerEmail" type="email" value={form.referrerEmail} onChange={(e) => setField("referrerEmail", e.target.value)} required />
          {errors.referrerEmail ? <p className="text-xs text-red-600">{errors.referrerEmail}</p> : null}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4">
        <p className="mb-3 text-sm font-semibold text-gray-700">Friend&apos;s details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="friendName">Friend&apos;s name</Label>
            <Input id="friendName" value={form.friendName} onChange={(e) => setField("friendName", e.target.value)} required />
            {errors.friendName ? <p className="text-xs text-red-600">{errors.friendName}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="friendPhone">Friend&apos;s phone</Label>
            <Input id="friendPhone" type="tel" value={form.friendPhone} onChange={(e) => setField("friendPhone", e.target.value)} required />
            {errors.friendPhone ? <p className="text-xs text-red-600">{errors.friendPhone}</p> : null}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="friendEmail">Friend&apos;s email <span className="text-gray-400">(optional)</span></Label>
            <Input id="friendEmail" type="email" value={form.friendEmail} onChange={(e) => setField("friendEmail", e.target.value)} />
            {errors.friendEmail ? <p className="text-xs text-red-600">{errors.friendEmail}</p> : null}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="message">Optional message</Label>
            <textarea
              id="message"
              rows={3}
              value={form.message}
              onChange={(e) => setField("message", e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Add a personal note (optional)"
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="w-full rounded-xl bg-blue-600 py-6 text-base font-semibold hover:bg-blue-700">
        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</> : "Submit Referral"}
      </Button>
    </form>
  );
}
