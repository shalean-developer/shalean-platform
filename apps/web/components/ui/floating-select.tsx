"use client";

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

/** Matches room-style `FloatingSelect` labels (service + address row, room pickers). */
export const ROOM_FIELD_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wide text-blue-900/85 dark:text-blue-200/90";

/** Text inputs aligned with `variant="room"` floating triggers (border / tint / focus). */
export const ROOM_TEXT_INPUT_CLASS = cn(
  "h-12 w-full rounded-xl border px-3 text-base text-zinc-900 shadow-sm transition-[border-color,box-shadow,background-color]",
  "focus-visible:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-500",
  "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
  "border-blue-200/80 bg-blue-50/40 hover:border-blue-400/70 hover:bg-blue-50/70 hover:shadow-md dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-zinc-100 dark:hover:border-blue-600/55 dark:hover:bg-blue-950/40",
);

/** Vertical gap between trigger and custom option panel (native `<select>` cannot do this). */
const TRIGGER_PANEL_GAP_PX = 10;

export type FloatingSelectOption = { value: string; label: string };

export type FloatingSelectProps = {
  label: string;
  name?: string;
  value: string;
  onChange: (next: string) => void;
  options: FloatingSelectOption[];
  disabled?: boolean;
  variant?: "default" | "room";
  className?: string;
  triggerClassName?: string;
  "aria-label"?: string;
};

export function FloatingSelect({
  label,
  name,
  value,
  onChange,
  options,
  disabled = false,
  variant = "default",
  className,
  triggerClassName,
  "aria-label": ariaLabel,
}: FloatingSelectProps) {
  const reactId = useId();
  const triggerId = `${reactId}-trigger`;
  const listboxId = `${reactId}-listbox`;
  const labelId = `${reactId}-label`;

  const [open, setOpen] = useState(false);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = useMemo(() => {
    const i = options.findIndex((o) => o.value === value);
    return i >= 0 ? i : 0;
  }, [options, value]);

  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex);
  }, [open, selectedIndex]);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? value,
    [options, value],
  );

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    middleware: [
      offset(TRIGGER_PANEL_GAP_PX),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
            minWidth: `${rects.reference.width}px`,
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  const pick = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      refs.floating.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open, refs.floating]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = itemRefs.current[activeIndex];
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(0, options.length - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) pick(opt.value);
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const isRoom = variant === "room";

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {name ? <input type="hidden" name={name} value={value} readOnly aria-hidden /> : null}
      <label id={labelId} htmlFor={triggerId} className={cn("block", isRoom ? ROOM_FIELD_LABEL_CLASS : defaultLabelClass)}>
        {label}
      </label>
      <button
        ref={refs.setReference}
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className={cn(
          "relative flex h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-base shadow-sm transition-[border-color,box-shadow,background-color]",
          "focus-visible:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isRoom ? roomTriggerClass : defaultTriggerClass,
          triggerClassName,
        )}
        {...getReferenceProps({
          onKeyDown: onTriggerKeyDown,
        })}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            open && "-rotate-180",
            isRoom ? "text-blue-700 dark:text-blue-400/90" : "text-zinc-500 dark:text-zinc-400",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelId}
            aria-activedescendant={`${listboxId}-opt-${activeIndex}`}
            className={cn(
              "z-[100] max-h-64 overflow-y-auto rounded-xl border bg-white py-1.5 shadow-xl outline-none",
              "border-zinc-200/95 dark:border-zinc-600 dark:bg-zinc-900",
              isRoom
                ? "ring-1 ring-blue-500/15 dark:ring-blue-400/10"
                : "ring-1 ring-zinc-900/5 dark:ring-white/10",
            )}
            {...getFloatingProps({ onKeyDown: onListKeyDown })}
          >
            {options.map((opt, i) => {
              const selected = opt.value === value;
              const active = i === activeIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  className={cn(
                    "mx-1.5 flex w-[calc(100%-0.75rem)] cursor-pointer rounded-lg px-3 py-2.5 text-left text-base transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-500",
                    active && "bg-blue-50/90 dark:bg-blue-950/50",
                    selected && !active && "bg-zinc-100/80 dark:bg-zinc-800/60",
                    !selected && !active && "hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                  )}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => pick(opt.value)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}

const defaultLabelClass = "text-sm font-medium text-zinc-800 dark:text-zinc-200";

const defaultTriggerClass =
  "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

const roomTriggerClass =
  "cursor-pointer border-blue-200/80 bg-blue-50/40 text-zinc-900 hover:border-blue-400/70 hover:bg-blue-50/70 hover:shadow-md dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-zinc-100 dark:hover:border-blue-600/55 dark:hover:bg-blue-950/40";
