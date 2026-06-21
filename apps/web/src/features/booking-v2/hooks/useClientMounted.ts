"use client";

import { useEffect, useState } from "react";

/** True after the first client paint — use to skip SSR for extension-sensitive form controls. */
export function useClientMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
