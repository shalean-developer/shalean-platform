import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Extra classes on the outer wrapper (e.g. vertical padding on standalone pages). */
  className?: string;
};

/**
 * Standard booking flow content width — use for Service, When, Cleaner, Checkout, and Success
 * so the flow reads as one guided experience (max-w-3xl, shared rhythm).
 */
export default function BookingContainer({ children, className }: Props) {
  return (
    <div className="w-full transition-all duration-300">
      <div
        className={["mx-auto w-full max-w-3xl px-4 py-6 md:px-6", className ?? ""].filter(Boolean).join(" ")}
      >
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}
