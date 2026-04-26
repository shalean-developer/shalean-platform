export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthBody = {
  status: "ok";
  service: "shalean-api";
  timestamp: string;
};

/**
 * Lightweight liveness probe for load balancers and local dev (Postman).
 */
export function GET(): Response {
  const body: HealthBody = {
    status: "ok",
    service: "shalean-api",
    timestamp: new Date().toISOString(),
  };
  return Response.json(body);
}
