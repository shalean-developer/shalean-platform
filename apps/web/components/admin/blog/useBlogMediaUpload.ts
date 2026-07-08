"use client";

import { useCallback, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

async function getAdminToken(): Promise<string | null> {
  const sb = getSupabaseBrowser();
  const session = await sb?.auth.getSession();
  return session?.data.session?.access_token ?? null;
}

type UploadResult = { url: string; path: string };

type Options = {
  folder?: string;
};

export function useBlogMediaUpload() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File, opts?: Options): Promise<UploadResult | null> => {
    setError(null);
    setUploading(true);
    try {
      const token = await getAdminToken();
      if (!token) {
        setError("Not signed in.");
        return null;
      }

      const form = new FormData();
      form.append("file", file);
      if (opts?.folder) form.append("folder", opts.folder);

      const res = await fetch("/api/admin/blog/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string; url?: string; path?: string };
      if (!res.ok || !json.url || !json.path) {
        setError(json.error ?? "Upload failed.");
        return null;
      }

      return { url: json.url, path: json.path };
    } catch {
      setError("Upload failed.");
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  return { uploadFile, uploading, error, clearError: () => setError(null) };
}
