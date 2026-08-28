const typographyRoles = [
  ["Page title", "--ui-text-page-title", "--ui-leading-tight"],
  ["Section title", "--ui-text-section-title", "--ui-leading-tight"],
  ["Card title", "--ui-text-card-title", "--ui-leading-tight"],
  ["Lead", "--ui-text-lead", "--ui-leading-body"],
  ["Body", "--ui-text-body", "--ui-leading-body"],
  ["Small", "--ui-text-small", "--ui-leading-body"],
  ["Caption", "--ui-text-caption", "--ui-leading-body"],
] as const;

const spacingRoles = ["1", "2", "3", "4", "5", "6", "8", "10", "12", "16", "20", "24"] as const;
const radiusRoles = ["sm", "md", "lg", "xl", "2xl", "pill"] as const;
const shadowRoles = ["sm", "md", "lg", "xl"] as const;
const containerRoles = [
  ["Small", "--ui-container-sm"],
  ["Medium", "--ui-container-md"],
  ["Large", "--ui-container-lg"],
  ["Content", "--ui-container-content"],
  ["Wide", "--ui-container-wide"],
] as const;
const layerRoles = [
  ["Base", "--ui-z-base", "0"],
  ["Sticky", "--ui-z-sticky", "20"],
  ["Dropdown", "--ui-z-dropdown", "40"],
  ["Overlay", "--ui-z-overlay", "50"],
  ["Toast", "--ui-z-toast", "60"],
  ["Maximum", "--ui-z-max", "100"],
] as const;

function TokenCode({ children }: { children: string }) {
  return <code className="text-xs text-muted-foreground">{children}</code>;
}

export function FoundationScaleShowcase() {
  return (
    <section
      aria-labelledby="rd-p01b2-foundations"
      className="border-b border-border bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8"
    >
      <div className="mx-auto space-y-8" style={{ maxWidth: "var(--ui-container-wide)" }}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className="rounded-full bg-primary px-2.5 py-1 text-primary-foreground">RD-P01B2</span>
            <span className="rounded-full border border-border px-2.5 py-1">Canonical foundation scales</span>
            <span className="rounded-full border border-border px-2.5 py-1">Development only</span>
          </div>
          <div>
            <h2 id="rd-p01b2-foundations" className="font-bold tracking-tight" style={{ fontSize: "var(--ui-text-page-title)", lineHeight: "var(--ui-leading-tight)" }}>
              Canonical layout scales
            </h2>
            <p className="mt-2 max-w-3xl text-muted-foreground" style={{ fontSize: "var(--ui-text-body)", lineHeight: "var(--ui-leading-body)" }}>
              These specimens consume the RD-P01B CSS variables directly. They are visual references for shared UI migration and do not change booking, payment, RBAC, persistence or other business behaviour.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h3 className="font-semibold" style={{ fontSize: "var(--ui-text-card-title)" }}>Typography roles</h3>
            <div className="mt-5 space-y-5">
              {typographyRoles.map(([label, sizeToken, lineToken]) => (
                <div key={label} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{label}</span>
                    <TokenCode>{sizeToken}</TokenCode>
                  </div>
                  <div style={{ fontSize: `var(${sizeToken})`, lineHeight: `var(${lineToken})` }}>Shalean reusable interface typography</div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h3 className="font-semibold" style={{ fontSize: "var(--ui-text-card-title)" }}>Spacing scale</h3>
            <div className="mt-5 space-y-3">
              {spacingRoles.map((role) => (
                <div key={role} className="grid grid-cols-[5rem_1fr_auto] items-center gap-3">
                  <TokenCode>{`--ui-space-${role}`}</TokenCode>
                  <div className="h-5 rounded-sm bg-muted">
                    <div className="h-full rounded-sm bg-primary" style={{ width: `var(--ui-space-${role})` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">space {role}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h3 className="font-semibold" style={{ fontSize: "var(--ui-text-card-title)" }}>Radius + elevation</h3>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {radiusRoles.map((role) => (
                <div key={role} className="space-y-2">
                  <div className="h-20 border border-border bg-muted" style={{ borderRadius: `var(--ui-radius-${role})` }} />
                  <TokenCode>{`--ui-radius-${role}`}</TokenCode>
                </div>
              ))}
            </div>
            <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {shadowRoles.map((role) => (
                <div key={role} className="space-y-2">
                  <div className="h-20 rounded-xl border border-border bg-card" style={{ boxShadow: `var(--ui-shadow-${role})` }} />
                  <TokenCode>{`--ui-shadow-${role}`}</TokenCode>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
            <h3 className="font-semibold" style={{ fontSize: "var(--ui-text-card-title)" }}>Container widths</h3>
            <p className="mt-1 text-sm text-muted-foreground">Bars are capped by the viewport but consume the canonical maximum-width tokens directly.</p>
            <div className="mt-5 space-y-4">
              {containerRoles.map(([label, token]) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between gap-2 text-xs"><span>{label}</span><TokenCode>{token}</TokenCode></div>
                  <div className="h-7 rounded-md border border-primary/30 bg-primary/10" style={{ width: "100%", maxWidth: `var(${token})` }} />
                </div>
              ))}
              <div className="rounded-lg border border-border bg-muted p-3 text-sm">
                Page gutter: <TokenCode>--ui-page-gutter</TokenCode>
              </div>
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm lg:col-span-2">
            <h3 className="font-semibold" style={{ fontSize: "var(--ui-text-card-title)" }}>Layer scale</h3>
            <p className="mt-1 text-sm text-muted-foreground">Canonical stacking roles for sticky chrome, menus, overlays and notifications.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {layerRoles.map(([label, token, value]) => (
                <div key={label} className="rounded-lg border border-border bg-muted p-4">
                  <div className="font-semibold">{label}</div>
                  <div className="mt-1 text-2xl font-bold">{value}</div>
                  <div className="mt-2"><TokenCode>{token}</TokenCode></div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
