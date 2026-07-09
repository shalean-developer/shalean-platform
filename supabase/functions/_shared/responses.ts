export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function okResponse(result: Record<string, unknown> = {}): Response {
  return jsonResponse({ ok: true, runtime: "supabase_edge", ...result });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ ok: false, error: message, runtime: "supabase_edge" }, status);
}

export function skippedResponse(reason: string): Response {
  return jsonResponse({ ok: true, skipped: reason, runtime: "supabase_edge" });
}
