export type ProfileAreaChip = { id: string; label: string };

export default function AreasChips({ items }: { items: ProfileAreaChip[] }) {
  if (!items.length) return null;

  return (
    <section>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Working areas</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((a) => (
          <span
            key={a.id}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200"
          >
            {a.label}
          </span>
        ))}
      </div>
    </section>
  );
}
