"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, Copy, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardToast } from "@/components/dashboard/dashboard-toast-context";

export type ReferralSharePanelProps = {
  referralCode: string;
  inviteUrl: string;
};

function qrImageUrl(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
}

export function ReferralSharePanel({ referralCode, inviteUrl }: ReferralSharePanelProps) {
  const toast = useDashboardToast();
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const shareText = useMemo(
    () =>
      `Hey! I've been using Shalean Cleaning Services and they're great. Use my referral link to get a discount on your first booking: ${inviteUrl}`,
    [inviteUrl],
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast("Referral link copied!", "success");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("Could not copy. Try long-pressing the link.", "error");
    }
  }, [inviteUrl, toast]);

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
  }

  async function shareNative() {
    try {
      await navigator.share({
        title: "Shalean referral",
        text: shareText,
        url: inviteUrl,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      void copyLink();
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-xl bg-white p-2 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrImageUrl(inviteUrl)}
            alt={`QR code for referral ${referralCode}`}
            width={144}
            height={144}
            className="h-36 w-36 rounded-lg"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">Scan or share</p>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur">
            <p className="flex-1 truncate font-mono text-xs text-white">{inviteUrl}</p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="shrink-0 rounded-lg bg-white/20 p-1.5 hover:bg-white/30"
              aria-label="Copy link"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-green-300" /> : <Copy className="h-4 w-4 text-white" />}
            </button>
          </div>
        </div>
      </div>

      <div className={canNativeShare ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
        <Button
          type="button"
          className="rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-semibold"
          onClick={() => void copyLink()}
        >
          <Copy className="mr-2 h-4 w-4" />
          {copied ? "Copied!" : "Copy link"}
        </Button>
        <Button
          type="button"
          className="rounded-xl bg-green-500 text-white hover:bg-green-600 font-semibold"
          onClick={shareWhatsApp}
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          WhatsApp
        </Button>
        {canNativeShare ? (
          <Button
            type="button"
            className="rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 font-semibold"
            onClick={() => void shareNative()}
          >
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        ) : null}
      </div>
    </div>
  );
}
