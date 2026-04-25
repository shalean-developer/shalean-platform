type Input = {
  serviceType: string | null | undefined;
  locationSlug?: string | null;
};

const parseList = (v?: string) =>
  (v || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function shouldUseTeamAssignment({ serviceType, locationSlug }: Input): boolean {
  if (process.env.ENABLE_TEAM_ASSIGNMENT !== "true") {
    return false;
  }

  const service = String(serviceType ?? "").toLowerCase();
  const isDeep = service.includes("deep");
  const isMove = service.includes("move");

  if (process.env.TEAM_ASSIGN_DEEP_ONLY === "true" && !isDeep) {
    return false;
  }

  if (process.env.TEAM_ASSIGN_MOVE_ONLY === "true" && !isMove) {
    return false;
  }

  const allowed = parseList(process.env.TEAM_ASSIGN_ALLOWED_LOCATIONS);
  if (allowed.length > 0) {
    const loc = String(locationSlug ?? "").toLowerCase();
    if (!allowed.includes(loc)) {
      return false;
    }
  }

  return true;
}

