type ToggleChipProps = {
  id: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: (id: string) => void;
  /** Small badge top-right (e.g. “Most popular”). */
  badge?: string | null;
  /** Secondary line under label. */
  description?: string | null;
  /** Shown on the right (e.g. add-on price). */
  priceLabel?: string | null;
};

export function ToggleChip({
  id,
  label,
  selected,
  disabled,
  onToggle,
  badge,
  description,
  priceLabel,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={selected}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        onToggle(id);
      }}
      className={[
        "relative w-full max-w-none select-none rounded-xl border-2 p-3 text-left transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "active:scale-[0.99]",
        disabled
          ? "cursor-not-allowed border-zinc-100 bg-zinc-100/80 text-zinc-400 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-600"
          : selected
            ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20 dark:border-primary dark:bg-primary dark:text-primary-foreground dark:shadow-primary/25"
            : "border-zinc-200 bg-white text-zinc-800 shadow-sm shadow-zinc-900/5 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      {badge ? (
        <span
          className={[
            "absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            selected
              ? "bg-white/20 text-white"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-100",
          ].join(" ")}
        >
          {badge}
        </span>
      ) : null}
      <span
        className={[
          "pointer-events-none absolute inset-0 rounded-[10px] opacity-0 transition-opacity duration-200",
          selected && !disabled ? "opacity-100" : "",
          "bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]",
        ].join(" ")}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3 pr-1">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug">{label}</div>
          {description ? (
            <p
              className={[
                "mt-1 text-xs leading-snug",
                selected ? "text-primary-foreground/90" : "text-zinc-500 dark:text-zinc-400",
              ].join(" ")}
            >
              {description}
            </p>
          ) : null}
        </div>
        {priceLabel ? (
          <span
            className={[
              "shrink-0 tabular-nums text-sm font-semibold",
              selected ? "text-primary-foreground" : "text-zinc-700 dark:text-zinc-200",
            ].join(" ")}
          >
            {priceLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}
