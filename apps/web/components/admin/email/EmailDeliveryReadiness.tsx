"use client";
import { useEffect, useState } from "react";
import { adminFetch } from "@/hooks/useAdminData";

type Readiness = { configured: boolean; outboundDisabled: boolean; providerWritesDisabled: boolean };
export function EmailDeliveryReadiness() {
  const [state, setState] = useState<Readiness | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void adminFetch<Readiness>("/api/admin/email/health").then(result => {
      if (!active) return;
      const data = result.data;
      if (data && typeof data.configured === "boolean" && typeof data.outboundDisabled === "boolean" && typeof data.providerWritesDisabled === "boolean") setState(data);
      setLoaded(true);
    }).catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  return <div className="mt-4 rounded-xl bg-muted/50 p-4 text-sm" role="status">
    {!loaded ? "Checking email readiness…" : !state ? "Delivery readiness is unavailable. No test email has been sent." : <>
      <p className="font-semibold">{state.outboundDisabled || !state.configured ? "Email delivery is paused" : "Email service is configured"}</p>
      <p className="mt-1 text-muted-foreground">{state.outboundDisabled ? "Messages stay disabled in this environment. You can review drafts and delivery records safely." : "Every promotional send still requires current verified consent and suppression checks."}</p>
      {state.providerWritesDisabled && <p className="mt-1 text-muted-foreground">Provider contact updates are paused.</p>}
      <p className="mt-1 text-muted-foreground">This readiness check does not send email.</p>
    </>}
  </div>;
}
