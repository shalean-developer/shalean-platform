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

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
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
