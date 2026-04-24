export function BeforeAfterSection() {
  return (
    <section className="border-b border-blue-100 bg-white py-16" aria-labelledby="before-after-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="before-after-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Before and After Cleaning Results
          </h2>
          <p className="mt-3 text-gray-600">
            Visual proof builds trust fast. Add real kitchen, bathroom, and living space photos here as soon as they are available.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <figure className="overflow-hidden rounded-2xl border border-gray-200 shadow-md">
            <div className="aspect-[4/3] bg-gradient-to-br from-zinc-200 via-zinc-100 to-zinc-200" role="img" aria-label="Before cleaning example" />
            <figcaption className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-center text-sm font-semibold text-zinc-700">
              Before — busy week, surfaces dulled
            </figcaption>
          </figure>
          <figure className="overflow-hidden rounded-2xl border border-blue-100 shadow-md shadow-blue-900/10">
            <div
              className="aspect-[4/3] bg-gradient-to-br from-blue-100 via-white to-blue-50"
              role="img"
              aria-label="After cleaning example"
            />
            <figcaption className="border-t border-blue-100 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-800">
              After — refreshed shine, floors streak-free
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
