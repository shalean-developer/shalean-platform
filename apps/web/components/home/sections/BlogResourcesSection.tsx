const posts = [
  {
    title: "Move-out cleaning checklist landlords notice",
    excerpt: "Room-by-room tasks that protect your deposit and speed up handover day.",
    body: "Start with cobwebs and ceiling corners, then work top-to-bottom in each room. Kitchens: degrease hob, wipe cupboards inside if empty, descale taps. Bathrooms: grout lines, mirrors, and exhaust fans. Finish with floors last so foot traffic does not undo your work.",
  },
  {
    title: "How to prep your home before a deep clean",
    excerpt: "Small steps that help cleaners focus on scrubbing, not tidying clutter.",
    body: "Clear countertops of dishes, stash valuables, and note fragile items. Leave out any preferred supplies. Unlock areas that need attention and secure pets in a safe room. The more surfaces are accessible, the deeper we can go in your booked time.",
  },
  {
    title: "Airbnb turnovers: what guests actually check",
    excerpt: "The five touchpoints that drive five-star reviews between stays.",
    body: "Guests notice dust on headboards, hair in drains, sticky remotes, smudged glass, and bin liners. A consistent turnover template plus photos after each clean keeps ratings high and support tickets low.",
  },
] as const;

export function BlogResourcesSection() {
  return (
    <section className="border-b border-blue-100 bg-blue-50/40 py-16" aria-labelledby="resources-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="resources-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Guides & resources
          </h2>
          <p className="mt-3 text-gray-600">Short reads to help you book smarter and keep results consistent.</p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {posts.map((post) => (
            <article key={post.title} className="flex h-full flex-col rounded-2xl border border-blue-200 bg-white p-6 transition hover:border-blue-400 hover:shadow-md">
              <h3 className="text-lg font-semibold text-zinc-900">{post.title}</h3>
              <p className="mt-2 flex-1 text-sm text-gray-600">{post.excerpt}</p>
              <details className="mt-4 group">
                <summary className="cursor-pointer text-sm font-semibold text-blue-600 transition hover:text-blue-700">Read more</summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{post.body}</p>
              </details>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
