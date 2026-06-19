import { existsSync, readFileSync } from "fs";
import { isAbsolute, join } from "path";

/** Load location SEO feedback JSON for Next `env` injection (build / dev boot only). */
export function loadLocationSeoFeedbackJsonForNextEnv(cwd: string): string | undefined {
  const inline = process.env.LOCATION_SEO_FEEDBACK_JSON?.trim();
  if (inline) return inline;

  const filePath =
    process.env.LOCATION_SEO_FEEDBACK_JSON_FILE?.trim() || join(cwd, "config/location-seo-feedback.json");

  try {
    const resolved = isAbsolute(filePath) ? filePath : join(cwd, filePath);
    if (!existsSync(resolved)) return undefined;
    const raw = readFileSync(resolved, "utf8").trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}
