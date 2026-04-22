import { NextResponse } from "next/server";
import { calculatePrice } from "@/lib/booking/availabilityEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    serviceType?: string | null;
    bedrooms?: number;
    bathrooms?: number;
    date?: string;
    time?: string;
    cleanersCount?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const date = String(body.date ?? "");
  const time = String(body.time ?? "");
  if (!date || !time) {
    return NextResponse.json({ error: "date and time are required." }, { status: 400 });
  }
  const result = calculatePrice({
    serviceType: body.serviceType ?? null,
    bedrooms: Math.max(1, Number(body.bedrooms ?? 1)),
    bathrooms: Math.max(1, Number(body.bathrooms ?? 1)),
    date,
    time,
    cleanersCount: Math.max(0, Number(body.cleanersCount ?? 0)),
  });
  return NextResponse.json(result);
}
