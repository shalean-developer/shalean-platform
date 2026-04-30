import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getPaystackBaseUrl } from "@/lib/payout/paystackOrigin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaymentDetailsRow = {
  cleaner_id: string;
  account_number: string | null;
  bank_code: string | null;
  account_name: string | null;
  recipient_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PaymentDetailsBody = {
  accountNumber?: unknown;
  bankCode?: unknown;
  accountName?: unknown;
};

type PaystackRecipientJson = {
  status?: boolean;
  message?: string;
  data?: {
    recipient_code?: string;
  };
};

function maskAccountNumber(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `****${digits.slice(-4)}`;
}

function normalizeBody(body: PaymentDetailsBody): { ok: true; accountNumber: string; bankCode: string; accountName: string } | { ok: false; error: string } {
  const accountNumber = String(body.accountNumber ?? "").replace(/\s+/g, "").trim();
  const bankCode = String(body.bankCode ?? "").trim();
  const accountName = String(body.accountName ?? "").replace(/\s+/g, " ").trim();

  if (!/^\d{6,20}$/.test(accountNumber)) {
    return { ok: false, error: "Account number must be 6 to 20 digits." };
  }
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(bankCode)) {
    return { ok: false, error: "Select a valid bank." };
  }
  if (accountName.length < 2 || accountName.length > 120) {
    return { ok: false, error: "Account name must be between 2 and 120 characters." };
  }

  return { ok: true, accountNumber, bankCode, accountName };
}

function serializeDetails(row: PaymentDetailsRow | null) {
  if (!row) return null;
  return {
    cleanerId: row.cleaner_id,
    bankCode: row.bank_code,
    accountName: row.account_name,
    accountNumberMasked: maskAccountNumber(row.account_number),
    hasRecipientCode: Boolean(row.recipient_code?.trim()),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createPaystackRecipient(params: {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}): Promise<{ ok: true; recipientCode: string } | { ok: false; error: string; status?: number }> {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) return { ok: false, error: "Paystack is not configured.", status: 503 };

  let res: Response;
  try {
    res = await fetch(`${getPaystackBaseUrl()}/transferrecipient`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "basa",
        name: params.accountName,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: "ZAR",
      }),
    });
  } catch {
    return { ok: false, error: "Network error while creating Paystack recipient.", status: 502 };
  }

  const json = (await res.json().catch(() => ({}))) as PaystackRecipientJson;
  if (!res.ok || json.status === false) {
    return { ok: false, error: json.message ?? "Could not create Paystack recipient.", status: res.ok ? 400 : res.status };
  }

  const recipientCode = json.data?.recipient_code?.trim();
  if (!recipientCode) {
    return { ok: false, error: "Paystack did not return a recipient code.", status: 502 };
  }

  return { ok: true, recipientCode };
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const { data, error } = await admin
    .from("cleaner_payment_details")
    .select("cleaner_id, account_number, bank_code, account_name, recipient_code, created_at, updated_at")
    .eq("cleaner_id", session.cleanerId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ details: serializeDetails((data as PaymentDetailsRow | null) ?? null) });
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  let body: PaymentDetailsBody;
  try {
    body = (await request.json()) as PaymentDetailsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const normalized = normalizeBody(body);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const recipient = await createPaystackRecipient(normalized);
  if (!recipient.ok) return NextResponse.json({ error: recipient.error }, { status: recipient.status ?? 400 });

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("cleaner_payment_details")
    .upsert(
      {
        cleaner_id: session.cleanerId,
        account_number: normalized.accountNumber,
        bank_code: normalized.bankCode,
        account_name: normalized.accountName,
        recipient_code: recipient.recipientCode,
        updated_at: now,
      },
      { onConflict: "cleaner_id" },
    )
    .select("cleaner_id, account_number, bank_code, account_name, recipient_code, created_at, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ details: serializeDetails((data as PaymentDetailsRow | null) ?? null) });
}
