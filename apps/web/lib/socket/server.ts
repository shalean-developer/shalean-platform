/**
 * Optional Socket.IO bridge for **self-hosted** Node (custom HTTP server).
 * Vercel serverless does not attach a persistent Socket.IO server — use Supabase Realtime there
 * (`postgres_changes` on `bookings` is already wired on the cleaner dashboard).
 *
 * Custom server: after `const io = new Server(httpServer)`, call `registerSocketIoServer(io)`
 * and join rooms with `socket.on("join", (room) => socket.join(room))` for `cleaner:<uuid>`.
 */
import type { Server } from "socket.io";

type G = typeof globalThis & { __shaleanSocketIo?: Server };

export function registerSocketIoServer(io: Server): void {
  (globalThis as G).__shaleanSocketIo = io;
}

export function getSocketIoServer(): Server | undefined {
  return (globalThis as G).__shaleanSocketIo;
}

export function emitToCleaner(cleanerId: string, event: string, payload: unknown): void {
  const io = getSocketIoServer();
  if (!io) {
    return;
  }
  io.to(`cleaner:${cleanerId}`).emit(event, payload);
}
