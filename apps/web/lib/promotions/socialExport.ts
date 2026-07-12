"use client";

import { toPng } from "html-to-image";

async function waitForImages(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          // Cache-bust soft timeout so export never hangs on a broken asset.
          window.setTimeout(done, 4000);
        }),
    ),
  );
}

/** Capture a DOM node (full-size social card) as a PNG data URL. */
export async function captureNodeAsPngDataUrl(node: HTMLElement): Promise<string> {
  // Temporarily undo preview scale so export is full resolution
  const prevTransform = node.style.transform;
  const prevOrigin = node.style.transformOrigin;
  node.style.transform = "none";
  node.style.transformOrigin = "top left";

  try {
    await waitForImages(node);
    return await toPng(node, {
      cacheBust: true,
      pixelRatio: 1,
      backgroundColor: "#0B1F4A",
    });  } finally {
    node.style.transform = prevTransform;
    node.style.transformOrigin = prevOrigin;
  }
}

export async function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** Download a remote image URL as a file (custom uploaded creatives). */
export async function downloadImageUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download image (${res.status}).`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** True when the asset has a custom uploaded creative (not QR data URL / not template-only). */
export function isCustomCampaignAssetImage(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false;
  if (imageUrl.startsWith("data:image/")) return false;
  return /^https?:\/\//i.test(imageUrl);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
