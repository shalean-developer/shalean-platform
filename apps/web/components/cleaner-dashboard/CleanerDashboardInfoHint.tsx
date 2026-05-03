"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tailwind `w-64` — fixed readable width; never depend on parent flex for width. */
const PANEL_WIDTH_PX = 256;
const VIEW_MARGIN = 12;

type CleanerDashboardInfoHintProps = {
  /** Shown in the popover. Use `\\n\\n` between short paragraphs for readability. */
  text: string;
  /** Accessible name for the trigger. */
  label?: string;
  /** `onDark` — earnings card (zinc/emerald on dark). `default` — light surfaces. */
  variant?: "default" | "onDark";
  /** Optional trigger colors (e.g. on tinted availability cards). */
  triggerClassName?: string;
  className?: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Tap toggles a short explainer. Renders in a **portal** with **fixed** positioning so
 * card `overflow`, stacking, and narrow flex rows cannot clip or shrink the panel.
 */
export function CleanerDashboardInfoHint({
  text,
  label = "More information",
  variant = "default",
  triggerClassName,
  className,
}: CleanerDashboardInfoHintProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxW = Math.min(PANEL_WIDTH_PX, vw - VIEW_MARGIN * 2);
    const halfW = maxW / 2;
    const centerX = r.left + r.width / 2;
    let minCenter = halfW + VIEW_MARGIN;
    let maxCenter = vw - halfW - VIEW_MARGIN;
    if (minCenter > maxCenter) {
      minCenter = vw / 2;
      maxCenter = vw / 2;
    }
    const leftPx = clamp(centerX, minCenter, maxCenter);
    const gap = 8;
    const estimatedPanelH = 160;
    const spaceBelow = vh - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const placeBelow = spaceBelow >= Math.min(estimatedPanelH, spaceAbove) || spaceBelow >= 100;

    setPanelStyle(
      placeBelow
        ? {
            position: "fixed",
            top: r.bottom + gap,
            left: leftPx,
            transform: "translateX(-50%)",
            width: maxW,
            maxHeight: `min(42vh, ${Math.max(72, spaceBelow - VIEW_MARGIN)}px)`,
            overflowY: "auto",
            zIndex: 9999,
          }
        : {
            position: "fixed",
            bottom: vh - r.top + gap,
            left: leftPx,
            transform: "translateX(-50%)",
            width: maxW,
            maxHeight: `min(42vh, ${Math.max(72, spaceAbove - VIEW_MARGIN)}px)`,
            overflowY: "auto",
            zIndex: 9999,
          },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onWindowClick = (e: MouseEvent) => {
      const n = e.target as Node;
      if (triggerRef.current?.contains(n) || panelRef.current?.contains(n)) return;
      setOpen(false);
    };
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, [open]);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, []);

  const iconClass =
    variant === "onDark"
      ? "text-white/45 hover:text-white/75 focus-visible:text-white/90"
      : "text-muted-foreground/90 hover:text-muted-foreground focus-visible:text-foreground";

  const paragraphs = text.split(/\n\n/).map((p) => p.trim()).filter(Boolean);
  const blocks = paragraphs.length > 0 ? paragraphs : [text.trim()].filter(Boolean);

  const panel = open && panelStyle ? (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label={label}
      style={panelStyle}
      className={cn(
        "pointer-events-auto rounded-lg border px-3 py-2.5 text-left text-sm leading-relaxed shadow-xl",
        "whitespace-normal break-words [overflow-wrap:anywhere]",
        /** Solid fills — avoid `bg-popover` tokens here; portaled nodes can miss theme vars and render transparent. */
        variant === "onDark"
          ? "border-zinc-600/70 bg-zinc-950 text-zinc-50"
          : "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50",
      )}
    >
      {blocks.map((p, i) => (
        <p key={i} className={cn(i > 0 && "mt-2")}>
          {p}
        </p>
      ))}
    </div>
  ) : null;

  return (
    <>
      <div className={cn("inline-flex shrink-0 align-top", className)} onKeyDown={onKeyDown}>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "rounded-md p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            variant === "onDark" ? "ring-offset-zinc-950" : "ring-offset-background",
            triggerClassName ?? iconClass,
          )}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? panelId : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <Info className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </div>
      {typeof document !== "undefined" && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
