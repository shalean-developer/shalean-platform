import type { ServiceItem } from "./serviceCategories";

type ServiceCardProps = {
  service: ServiceItem;
  selected: boolean;
  onClick: () => void;
};

export function ServiceCard({ service, selected, onClick }: ServiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group flex h-full min-h-[120px] w-full flex-col justify-between rounded-2xl border p-4 text-left",
        "transition-all duration-200 ease-out",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "hover:shadow-md active:scale-[0.995]",
        selected
          ? "border-primary/90 bg-primary/5 shadow-md shadow-primary/10 ring-2 ring-primary/25 dark:border-primary/70 dark:bg-primary/10 dark:shadow-primary/20 dark:ring-primary/30"
          : "border-zinc-200/90 bg-white shadow-sm shadow-zinc-900/5 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {service.badge ? (
          <span className="w-fit rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-emerald-950 dark:text-emerald-300">
            {service.badge}
          </span>
        ) : null}
        <p className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">
          {service.name}
        </p>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{service.description}</p>
      </div>
      <div className="mt-3 flex shrink-0 justify-end pt-1">
        <span
          className={[
            "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold transition-[colors,opacity] duration-200 ease-out",
            selected
              ? "border-primary bg-primary text-primary-foreground dark:border-primary dark:bg-primary"
              : "border-zinc-300 bg-white text-transparent opacity-80 group-hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-900",
          ].join(" ")}
          aria-hidden
        >
          ✓
        </span>
      </div>
    </button>
  );
}
