/** Placeholder while CMS services, FAQ, areas, and JSON-LD stream in. */
export function MarketingHomeDbSectionsFallback() {
  return (
    <>
      <div className="border-y border-slate-100 bg-white py-5" aria-hidden>
        <div className="mx-auto flex max-w-7xl gap-3 overflow-hidden px-4 sm:px-6 lg:px-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 w-40 shrink-0 animate-pulse rounded-xl bg-slate-100/90" />
          ))}
        </div>
      </div>
      <div className="bg-white py-16 md:py-20" aria-hidden>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto h-8 w-56 animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-[16/9] animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 bg-slate-50 py-16 md:py-20" aria-hidden>
        <div className="mx-auto h-48 max-w-7xl animate-pulse rounded-2xl bg-slate-100/80 px-4 sm:px-6 lg:px-8" />
      </div>
    </>
  );
}
