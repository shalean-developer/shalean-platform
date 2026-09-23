const implementedSlices = [
  { id: "RD-PUBLIC-01", title: "Public shell", detail: "Canonical header, footer, marketing canvas, page gutter and public CTA direction." },
  { id: "RD-PUBLIC-02", title: "Services hub", detail: "Six primary services, subordinate Window Cleaning guide and reusable homepage section patterns." },
  { id: "RD-PUBLIC-03", title: "Six-service template", detail: "One governed route template with service-specific content, pricing, FAQs, actions and navigation." },
  { id: "RD-PUBLIC-04", title: "Cleaning prices", detail: "Evergreen commercial pricing page sourced from the booking catalogue with visible fee disclosure." },
] as const;

export function RDPublicPagesShowcase() {
  return (
    <section className="mx-auto w-full max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)] py-[var(--ui-space-10)]" aria-labelledby="rd-public-pages-heading">
      <div className="flex flex-wrap items-center gap-[var(--ui-space-2)]">
        <span className="rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-primary-foreground">RD-PUBLIC-04B</span>
        <span className="rounded-[var(--ui-radius-pill)] bg-secondary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-secondary-foreground">CLOSURE REVIEW</span>
      </div>

      <h2 id="rd-public-pages-heading" className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Public-page implementation authority</h2>
      <p className="mt-[var(--ui-space-2)] max-w-3xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
        Current development-branch catalogue for RD-PUBLIC-01 through RD-PUBLIC-04. Implementation evidence remains subject to the combined closure gate; no production deployment is implied.
      </p>

      <div className="mt-[var(--ui-space-6)] grid gap-[var(--ui-space-4)] md:grid-cols-2 xl:grid-cols-4">
        {implementedSlices.map((slice) => (
          <article key={slice.id} className="rounded-[var(--ui-radius-xl)] border border-border bg-card p-[var(--ui-space-5)] text-card-foreground shadow-[var(--ui-shadow-sm)]">
            <p className="text-[length:var(--ui-text-caption)] font-semibold tracking-wide text-primary">{slice.id}</p>
            <h3 className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-card-title)] font-semibold">{slice.title}</h3>
            <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">{slice.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
