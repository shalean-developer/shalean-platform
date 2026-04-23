"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

export type NewJobPayload = {
  bookingId: string;
  timestamp: string;
};

/**
 * Optional Socket.IO client when `NEXT_PUBLIC_SOCKET_IO_URL` is set (dedicated Node socket server).
 * Supabase Realtime remains the default instant path on Vercel.
 */
export function useCleanerSocketIo(
  cleanerId: string | null | undefined,
  onNewJob: (payload: NewJobPayload) => void,
): void {
  const onNewJobRef = useRef(onNewJob);
  onNewJobRef.current = onNewJob;

  useEffect(() => {
    const base = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SOCKET_IO_URL?.trim() : "";
    if (!base || !cleanerId) return;

    const socket: Socket = io(base, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });

    socket.on("connect", () => {
      socket.emit("join", `cleaner:${cleanerId}`);
    });

    socket.on("NEW_JOB", (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const p = payload as Record<string, unknown>;
      const bookingId = typeof p.bookingId === "string" ? p.bookingId : "";
      const timestamp = typeof p.timestamp === "string" ? p.timestamp : new Date().toISOString();
      if (bookingId) onNewJobRef.current({ bookingId, timestamp });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [cleanerId]);
}
