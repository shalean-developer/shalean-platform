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
  "text-xs font-semibold uppercase tracking-wide text-primary";

/** Text inputs aligned with `variant="room"` floating triggers (border / tint / focus). */
export const ROOM_TEXT_INPUT_CLASS = cn(
  "h-12 w-full rounded-xl border px-3 text-base text-foreground shadow-sm transition-[border-color,box-shadow,background-color]",
  "focus-visible:border-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
  "placeholder:text-muted-foreground",
  "border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10 hover:shadow-md",
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
  labelClassName?: string;
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
  labelClassName,
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
      <label
        id={labelId}
        htmlFor={triggerId}
        className={cn("block", labelClassName ?? (isRoom ? ROOM_FIELD_LABEL_CLASS : defaultLabelClass))}
      >
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
          "focus-visible:border-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isRoom ? roomTriggerClass : defaultTriggerClass,
          triggerClassName,
        )}
        {...getReferenceProps({ onKeyDown: onTriggerKeyDown })}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "-rotate-180",
            isRoom && "text-primary",
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
              "z-[100] max-h-64 overflow-y-auto rounded-xl border border-border bg-popover py-1.5 text-popover-foreground shadow-xl outline-none ring-1 ring-border",
              isRoom && "ring-primary/15",
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
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring",
                    active && "bg-accent text-accent-foreground",
                    selected && !active && "bg-muted text-foreground",
                    !selected && !active && "hover:bg-accent hover:text-accent-foreground",
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

const defaultLabelClass = "text-sm font-medium text-foreground";

const defaultTriggerClass =
  "border-input bg-background text-foreground";

const roomTriggerClass =
  "cursor-pointer border-primary/20 bg-primary/5 text-foreground hover:border-primary/40 hover:bg-primary/10 hover:shadow-md";
