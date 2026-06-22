import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";

const cache = new Map<string, string>();

function publicAssetUrl(relativePath: string): string {
  const base = getPublicAppUrlBase().replace(/\/$/, "");
  return `${base}/${relativePath.replace(/^\//, "")}`;
}

function readPublicAssetDataUri(relativePath: string, mime: string): string {
  const key = `${mime}:${relativePath}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const filePath = path.join(process.cwd(), "public", relativePath.replace(/^\//, ""));
    const buf = readFileSync(filePath);
    const uri = `data:${mime};base64,${buf.toString("base64")}`;
    cache.set(key, uri);
    return uri;
  } catch {
    const uri = publicAssetUrl(relativePath);
    cache.set(key, uri);
    return uri;
  }
}

export function getEmbeddedShaleanLogoDataUri(): string {
  return readPublicAssetDataUri("images/shalean-logo.png", "image/png");
}

export function getEmbeddedEmailSocialIconDataUri(id: "facebook" | "instagram" | "whatsapp"): string {
  return readPublicAssetDataUri(`images/email/social-${id}.png`, "image/png");
}
