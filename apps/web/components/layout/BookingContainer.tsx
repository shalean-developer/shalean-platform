import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Extra classes on the outer wrapper (e.g. vertical padding on standalone pages). */
  className?: string;
};

/**
 * Booking flow content: full width on small screens (wider cards, matches entry/quote feel),
 * capped and centered from `md` up.
 */
export default function BookingContainer({ children, className }: Props) {
  return (
    <div className="w-full max-w-none transition-all duration-300">
      <div
        className={["w-full max-w-none px-4 py-6 md:mx-auto md:max-w-3xl md:px-6", className ?? ""].filter(Boolean).join(" ")}
      >
        <div className="w-full max-w-none space-y-6">{children}</div>
      </div>
    </div>
  );
}
