type SectionCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm shadow-zinc-900/5 transition-shadow duration-200 hover:shadow-md hover:shadow-zinc-900/5 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/20">
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
