type ToggleChipProps = {
  id: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: (id: string) => void;
};

export function ToggleChip({ id, label, selected, disabled, onToggle }: ToggleChipProps) {
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
        "relative inline-flex min-h-[44px] select-none items-center justify-center overflow-hidden rounded-full border-2 px-4 py-2.5 text-sm font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "active:scale-[0.97]",
        disabled
          ? "cursor-not-allowed border-zinc-100 bg-zinc-100/80 text-zinc-400 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-600"
          : selected
            ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20 dark:border-primary dark:bg-primary dark:text-primary-foreground dark:shadow-primary/25"
            : "border-zinc-200 bg-white text-zinc-700 shadow-sm shadow-zinc-900/5 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-500 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200",
          selected && !disabled ? "opacity-100" : "",
          "bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]",
        ].join(" ")}
        aria-hidden
      />
      <span className="relative">{label}</span>
    </button>
  );
}
