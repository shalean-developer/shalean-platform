"use client";

import { useEffect, useState } from "react";
import BookingDetailsView from "@/components/admin/BookingDetailsView";

export default function BookingDetailsSheet({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [bookingId, onClose]);

  if (!bookingId) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close booking details"
        onClick={onClose}
        className={["absolute inset-0 bg-black/30 transition-opacity duration-200", entered ? "opacity-100" : "opacity-0"].join(" ")}
      />
      <div
        className={[
          "absolute right-0 top-0 h-dvh w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-white shadow-2xl transition-transform duration-250 ease-out",
          entered ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <BookingDetailsView booking={{ id: bookingId }} onClose={onClose} />
      </div>
    </div>
  );
}
