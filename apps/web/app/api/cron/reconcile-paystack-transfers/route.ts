import { NextResponse } from "next/server";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { applyTransferFailed, applyTransferSuccess } from "@/lib/payout/paystackTransferStatus";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_STUCK_MINUTES = 30;
const DEFAULT_BATCH_SIZE = 25;

type ProcessingTransferRow = {
  id: string;
  payout_id: string;
  transfer_code: string | null;
  created_at: string;
};

type PaystackTransferLookup = {
  status?: boolean;
  message?: string;
  data?: {
    transfer_code?: string | null;
    status?: string | null;
    reason?: string | null;
    failures?: string | null;
  };
};

function cronAuthorized(request: Request): { ok: true } | { ok: false; response: NextResponse } {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false, response: NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 }) };
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  return { ok: true };
}

function positiveNumberFromEnv(name: string, fallback: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.floor(value));
}

async function fetchPaystackTransfer(transferCode: string): Promise<{ ok: true; json: PaystackTransferLookup } | { ok: false; error: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "PAYSTACK_SECRET_KEY is not configured." };

  const res = await fetch(`https://api.paystack.co/transfer/${encodeURIComponent(transferCode)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });

  const json = (await res.json().catch(() => ({}))) as PaystackTransferLookup;
  if (!res.ok || json.status === false) {
    return { ok: false, error: json.message ?? `Paystack lookup failed with ${res.status}.` };
  }
  return { ok: true, json };
}

export async function POST(request: Request) {
  const auth = cronAuthorized(request);
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });

  const stuckMinutes = positiveNumberFromEnv("PAYSTACK_TRANSFER_RECONCILE_AFTER_MINUTES", DEFAULT_STUCK_MINUTES, 24 * 60);
  const batchSize = positiveNumberFromEnv("PAYSTACK_TRANSFER_RECONCILE_BATCH_SIZE", DEFAULT_BATCH_SIZE, 100);
  const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("payout_transfers")
    .select("id, payout_id, transfer_code, created_at")
    .eq("status", "processing")
    .lt("created_at", cutoff)
    .not("transfer_code", "is", null)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const transfers = (data ?? []) as ProcessingTransferRow[];
  let checked = 0;
  let confirmed = 0;
  let failed = 0;
  let stillProcessing = 0;
  const errors: { transferCode: string; error: string }[] = [];

  for (const transfer of transfers) {
    const transferCode = transfer.transfer_code?.trim();
    if (!transferCode) continue;

    checked++;
    const lookup = await fetchPaystackTransfer(transferCode);
    if (!lookup.ok) {
      errors.push({ transferCode, error: lookup.error });
      continue;
    }

    const paystackStatus = lookup.json.data?.status?.toLowerCase().trim() ?? "";
    const payload = {
      event: "transfer.reconciled",
      source: "cron/reconcile-paystack-transfers",
      data: lookup.json.data,
      checked_at: new Date().toISOString(),
    };

    if (paystackStatus === "success") {
      await applyTransferSuccess(supabase, { transfer_code: transferCode }, payload);
      confirmed++;
    } else if (["failed", "reversed"].includes(paystackStatus)) {
      await applyTransferFailed(
        supabase,
        {
          transfer_code: transferCode,
          reason: lookup.json.data?.reason ?? lookup.json.data?.failures ?? `Paystack status: ${paystackStatus}`,
        },
        payload,
      );
      failed++;
    } else {
      stillProcessing++;
    }
  }

  await logSystemEvent({
    level: errors.length ? "warn" : "info",
    source: "cron/reconcile-paystack-transfers",
    message: "Paystack transfer reconciliation finished",
    context: { stuckMinutes, batchSize, checked, confirmed, failed, stillProcessing, errors },
  });

  return NextResponse.json({
    ok: true,
    stuckMinutes,
    checked,
    confirmed,
    failed,
    stillProcessing,
    errors,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
