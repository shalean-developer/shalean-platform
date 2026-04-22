import type { ReactNode } from "react";
import { SectionCard } from "./SectionCard";

export type ServiceCategoryKind = "regular" | "specialised";

type CategoryMeta = {
  id: ServiceCategoryKind;
  title: string;
  description: string;
  icon: ReactNode;
};

const CATEGORIES: CategoryMeta[] = [
  {
    id: "regular",
    title: "Regular Cleaning",
    description: "Routine upkeep for homes, rentals, and guest-ready spaces.",
    icon: (
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl dark:bg-primary/20">
        ✦
      </span>
    ),
  },
  {
    id: "specialised",
    title: "Specialised Cleaning",
    description: "Deeper or targeted work — carpets, moves, and intensive resets.",
    icon: (
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-2xl dark:bg-primary/25">
        ◆
      </span>
    ),
  },
];

type CategoryPickerProps = {
  onSelect: (id: ServiceCategoryKind) => void;
};

export function CategoryPicker({ onSelect }: CategoryPickerProps) {
  return (
    <SectionCard title="Choose your service" description="Pick a category to see options tailored to your visit.">
      <div className="grid gap-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="group flex w-full items-start gap-4 rounded-2xl border border-zinc-200/90 bg-white p-5 text-left shadow-sm shadow-zinc-900/5 transition-all duration-300 ease-out hover:scale-[1.01] hover:border-primary/35 hover:bg-primary/5 hover:shadow-md active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-primary/45 dark:hover:bg-primary/10"
          >
            {c.icon}
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {c.title}
              </span>
              <span className="mt-1.5 block text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {c.description}
              </span>
            </span>
            <span
              className="mt-1 shrink-0 text-zinc-400 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden
            >
              →
            </span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}
