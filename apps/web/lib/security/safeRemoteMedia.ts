import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * SSRF-hardened remote media fetcher (MKT-001A / WS1).
 *
 * Server-only helper for downloading admin/user-supplied image URLs before we
 * re-upload them to a provider (e.g. Facebook Page photos). It refuses to reach
 * private, loopback, link-local, unique-local, multicast, reserved, or cloud
 * metadata addresses, validates every redirect hop, enforces a strict timeout
 * and response-size cap, and only accepts an explicit image MIME allowlist.
 *
 * Design notes:
 * - HTTPS only. HTTP is rejected (no documented provider need for plaintext).
 * - Manual redirect handling: each hop is re-validated (host + resolved IPs).
 * - DNS is resolved and every returned address is checked before connecting.
 *   Node re-resolves on connect, so a small DNS-rebinding window remains; this
 *   is documented as an accepted residual for the current runtime (no custom
 *   undici dispatcher dependency introduced in this phase).
 * - No cookies/credentials/Authorization headers are ever forwarded.
 * - Errors are typed and never echo the full URL or any secret.
 */

export const SAFE_MEDIA_DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
export const SAFE_MEDIA_DEFAULT_TIMEOUT_MS = 8_000;
export const SAFE_MEDIA_DEFAULT_MAX_REDIRECTS = 3;

/** Explicit image MIME allowlist → file extension. HTML/SVG/XML/scripts are rejected. */
export const SAFE_MEDIA_ALLOWED_MIME = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export type SafeMediaErrorCode =
  | "invalid_url"
  | "insecure_scheme"
  | "embedded_credentials"
  | "blocked_host"
  | "dns_error"
  | "too_many_redirects"
  | "timeout"
  | "too_large"
  | "content_type"
  | "unsupported_format"
  | "http_error"
  | "fetch_failed";

export type SafeMediaResult =
  | { ok: true; buffer: Buffer; mime: string; ext: string; bytes: number }
  | { ok: false; code: SafeMediaErrorCode; error: string };

export type SafeMediaOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  allowedMime?: Map<string, string>;
};

/** Hostnames that must never be resolved/contacted regardless of DNS. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function inCidr4(ipInt: number, base: string, maskBits: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt == null) return false;
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** Blocked IPv4 ranges: loopback, private, CGNAT, link-local, reserved, multicast, metadata. */
function isBlockedIpv4(ip: string): boolean {
  const int = ipv4ToInt(ip);
  if (int == null) return true; // fail closed on unparseable
  const ranges: Array<[string, number]> = [
    ["0.0.0.0", 8], // "this" network
    ["10.0.0.0", 8], // private
    ["100.64.0.0", 10], // CGNAT
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local (incl. 169.254.169.254 cloud metadata)
    ["172.16.0.0", 12], // private
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // TEST-NET-1
    ["192.168.0.0", 16], // private
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // TEST-NET-2
    ["203.0.113.0", 24], // TEST-NET-3
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved (incl. 255.255.255.255 broadcast)
  ];
  return ranges.some(([base, bits]) => inCidr4(int, base, bits));
}

function expandIpv6(ip: string): string[] | null {
  // Strip zone id and brackets.
  let addr = ip.replace(/^\[|\]$/g, "");
  const pct = addr.indexOf("%");
  if (pct >= 0) addr = addr.slice(0, pct);

  // Embedded IPv4 (e.g. ::ffff:1.2.3.4) — normalise last 32 bits to two hextets.
  const v4Match = addr.match(/(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Match) {
    const v4Int = ipv4ToInt(v4Match[2]!);
    if (v4Int == null) return null;
    const hi = ((v4Int >>> 16) & 0xffff).toString(16);
    const lo = (v4Int & 0xffff).toString(16);
    addr = `${v4Match[1]}${hi}:${lo}`;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0]!.split(":").filter(Boolean) : [];
  const tail = halves.length === 2 && halves[1] ? halves[1]!.split(":").filter(Boolean) : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  return groups.map((g) => g.padStart(4, "0").toLowerCase());
}

/** Blocked IPv6: loopback, unspecified, unique-local, link-local, multicast, mapped/embedded v4, doc. */
function isBlockedIpv6(ip: string): boolean {
  const groups = expandIpv6(ip);
  if (!groups) return true; // fail closed
  const first = parseInt(groups[0]!, 16);
  const joined = groups.join(":");

  if (joined === "0000:0000:0000:0000:0000:0000:0000:0001") return true; // ::1 loopback
  if (joined === "0000:0000:0000:0000:0000:0000:0000:0000") return true; // :: unspecified
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (first === 0x2001 && parseInt(groups[1]!, 16) === 0x0db8) return true; // 2001:db8::/32 doc

  // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible — validate embedded v4.
  if (
    groups.slice(0, 5).every((g) => g === "0000") &&
    (groups[5] === "ffff" || groups[5] === "0000")
  ) {
    const hi = parseInt(groups[6]!, 16);
    const lo = parseInt(groups[7]!, 16);
    const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isBlockedIpv4(v4);
  }
  return false;
}

/** True if an IP literal must not be contacted. Unknown/invalid inputs fail closed. */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export class SafeMediaUrlError extends Error {
  code: SafeMediaErrorCode;
  constructor(code: SafeMediaErrorCode, message: string) {
    super(message);
    this.name = "SafeMediaUrlError";
    this.code = code;
  }
}

/**
 * Synchronous URL-shape validation (no DNS). Throws {@link SafeMediaUrlError}.
 * Deterministic and unit-testable without network access.
 */
export function assertSafeHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeMediaUrlError("invalid_url", "The media URL is malformed.");
  }
  if (url.protocol !== "https:") {
    throw new SafeMediaUrlError("insecure_scheme", "Only https media URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new SafeMediaUrlError("embedded_credentials", "Media URLs must not contain credentials.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) {
    throw new SafeMediaUrlError("invalid_url", "The media URL has no host.");
  }
  // Literal IP host — validate immediately.
  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new SafeMediaUrlError("blocked_host", "The media URL resolves to a blocked address.");
    }
    return url;
  }
  if (isBlockedHostname(hostname)) {
    throw new SafeMediaUrlError("blocked_host", "The media URL host is not allowed.");
  }
  return url;
}

/** Resolve DNS for a hostname and reject if any returned address is blocked. */
export async function assertResolvedHostAllowed(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) {
    if (isBlockedIp(host)) {
      throw new SafeMediaUrlError("blocked_host", "The media URL resolves to a blocked address.");
    }
    return;
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new SafeMediaUrlError("dns_error", "The media URL host could not be resolved.");
  }
  if (!records.length) {
    throw new SafeMediaUrlError("dns_error", "The media URL host did not resolve.");
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new SafeMediaUrlError("blocked_host", "The media URL resolves to a blocked address.");
    }
  }
}

function normalizeImageMime(contentType: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(";")[0]!.trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

/**
 * Download a remote image with full SSRF protections. Never throws; returns a
 * typed result. Used before re-uploading media to third-party providers.
 */
export async function fetchRemoteImageSafely(
  rawUrl: string,
  options: SafeMediaOptions = {},
): Promise<SafeMediaResult> {
  const maxBytes = options.maxBytes ?? SAFE_MEDIA_DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? SAFE_MEDIA_DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? SAFE_MEDIA_DEFAULT_MAX_REDIRECTS;
  const allowedMime = options.allowedMime ?? SAFE_MEDIA_ALLOWED_MIME;

  let currentUrl: URL;
  try {
    currentUrl = assertSafeHttpUrl(rawUrl);
  } catch (e) {
    if (e instanceof SafeMediaUrlError) return { ok: false, code: e.code, error: e.message };
    return { ok: false, code: "invalid_url", error: "The media URL is invalid." };
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    try {
      await assertResolvedHostAllowed(currentUrl.hostname);
    } catch (e) {
      if (e instanceof SafeMediaUrlError) return { ok: false, code: e.code, error: e.message };
      return { ok: false, code: "blocked_host", error: "The media URL host is not allowed." };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        // Do not forward cookies/credentials; send a benign UA + Accept.
        headers: { Accept: "image/*", "User-Agent": "Shalean-Media-Fetcher/1.0" },
      });
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof Error && e.name === "AbortError") {
        return { ok: false, code: "timeout", error: "The media download timed out." };
      }
      return { ok: false, code: "fetch_failed", error: "The media could not be downloaded." };
    }
    clearTimeout(timer);

    // Handle redirects manually so each hop is re-validated.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { ok: false, code: "http_error", error: "Redirect without a target." };
      }
      let next: URL;
      try {
        next = assertSafeHttpUrl(new URL(location, currentUrl).href);
      } catch (e) {
        if (e instanceof SafeMediaUrlError) return { ok: false, code: e.code, error: e.message };
        return { ok: false, code: "blocked_host", error: "Redirect target is not allowed." };
      }
      currentUrl = next;
      continue;
    }

    if (!res.ok) {
      return { ok: false, code: "http_error", error: `Could not download image (${res.status}).` };
    }

    const mime = normalizeImageMime(res.headers.get("content-type"));
    if (!mime || !mime.startsWith("image/")) {
      return { ok: false, code: "content_type", error: "The URL did not return an image." };
    }
    const ext = allowedMime.get(mime);
    if (!ext) {
      return { ok: false, code: "unsupported_format", error: "Image must be PNG, JPEG, WebP, or GIF." };
    }

    const declaredLength = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, code: "too_large", error: "Image must be under 8MB." };
    }

    // Stream with a hard byte cap so we never buffer an oversized/chunked body.
    if (!res.body) {
      return { ok: false, code: "fetch_failed", error: "Empty media response." };
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        return { ok: false, code: "fetch_failed", error: "The media stream failed." };
      }
      if (chunk.done) break;
      if (chunk.value) {
        total += chunk.value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          return { ok: false, code: "too_large", error: "Image must be under 8MB." };
        }
        chunks.push(chunk.value);
      }
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    if (buffer.length < 100) {
      return { ok: false, code: "content_type", error: "The downloaded image is too small." };
    }
    return { ok: true, buffer, mime, ext, bytes: buffer.length };
  }

  return { ok: false, code: "too_many_redirects", error: "Too many redirects while fetching media." };
}
