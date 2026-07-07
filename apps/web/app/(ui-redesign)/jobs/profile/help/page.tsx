"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Mail, MessageCircle, Phone } from "lucide-react";
import { ProfileSettingsBackLink } from "@/components/cleaner/ProfileSettingsBackLink";
import {
  CUSTOMER_SUPPORT_EMAIL,
  CUSTOMER_SUPPORT_TELEPHONE_DISPLAY,
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
  CUSTOMER_SUPPORT_WHATSAPP_DISPLAY,
  CUSTOMER_SUPPORT_WHATSAPP_URL,
} from "@/lib/site/customerSupport";
import { cn } from "@/lib/utils";

const CLEANER_FAQS = [
  {
    q: "When do I get paid?",
    a: "Payouts run weekly on Fridays for completed jobs. Make sure your bank details are saved before the payout cut-off.",
  },
  {
    q: "How do I change my working days?",
    a: "Go to Profile → Availability and submit a change request. An admin will review and approve it.",
  },
  {
    q: "What if a payout fails?",
    a: "Check that your bank account number and name match your bank records, then update your details under Bank & payout details.",
  },
  {
    q: "How do I report an issue on a job?",
    a: "Open the job from your jobs list and use Report issue. Add photos if you can — they help support resolve it faster.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-50 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-sm font-medium text-slate-800">{q}</span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />
        )}
      </button>
      {open ? <p className="px-4 pb-3.5 text-sm text-slate-500">{a}</p> : null}
    </div>
  );
}

type ContactRowProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  href: string;
};

function ContactRow({ icon: Icon, iconBg, iconColor, label, value, href }: ContactRowProps) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 active:bg-gray-50"
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", iconBg)}>
        <Icon className={cn("size-4", iconColor)} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-0.5 text-xs text-slate-400">{value}</p>
      </div>
    </a>
  );
}

export default function ProfileHelpPage() {
  const supportMailto = `mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=${encodeURIComponent("Shalean cleaner — account help")}`;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-6 space-y-4">
      <ProfileSettingsBackLink />
      <div>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Help &amp; support</h1>
        <p className="mt-0.5 text-sm text-slate-400">Chat, FAQ, and contact us</p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-50">
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Contact us</p>
        </div>
        <ContactRow
          icon={MessageCircle}
          iconBg="bg-green-50"
          iconColor="text-green-600"
          label="WhatsApp"
          value={CUSTOMER_SUPPORT_WHATSAPP_DISPLAY}
          href={CUSTOMER_SUPPORT_WHATSAPP_URL}
        />
        <ContactRow
          icon={Phone}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          label="Phone"
          value={CUSTOMER_SUPPORT_TELEPHONE_DISPLAY}
          href={CUSTOMER_SUPPORT_TELEPHONE_TEL}
        />
        <ContactRow
          icon={Mail}
          iconBg="bg-orange-50"
          iconColor="text-orange-500"
          label="Email"
          value={CUSTOMER_SUPPORT_EMAIL}
          href={supportMailto}
        />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-3.5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">FAQ</p>
        </div>
        {CLEANER_FAQS.map((item) => (
          <FaqItem key={item.q} q={item.q} a={item.a} />
        ))}
      </div>
    </div>
  );
}
