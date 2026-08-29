const coreColors = [
  { name: "Shalean Navy", hex: "#0D1B69", css: "var(--navy-from)", use: "Brand depth, auth, high-emphasis controls" },
  { name: "Shalean Royal", hex: "#1A3DBD", css: "var(--navy-to)", use: "Hover, active brand emphasis" },
  { name: "Action Blue", hex: "#2563EB", css: "var(--primary)", use: "Primary actions, links, focus" },
  { name: "Blue Mist", hex: "#DBEAFE", css: "#DBEAFE", use: "Soft selected states and highlights" },
  { name: "Blue Ice", hex: "#EFF6FF", css: "#EFF6FF", use: "Very light brand-tinted surfaces" },
] as const;

const neutralColors = [
  { name: "Ink", hex: "#171717", css: "var(--foreground)", use: "Primary text" },
  { name: "Slate", hex: "#71717A", css: "var(--muted-foreground)", use: "Secondary text" },
  { name: "Cloud", hex: "#F4F4F5", css: "var(--muted)", use: "Soft surfaces and hover states" },
  { name: "Border", hex: "#E4E4E7", css: "var(--border)", use: "Dividers and input outlines" },
  { name: "White", hex: "#FFFFFF", css: "var(--background)", use: "Primary page and card surface" },
] as const;

const stateColors = [
  { name: "Success", hex: "#059669", css: "var(--success)", use: "Confirmed and completed states" },
  { name: "Warning", hex: "#F59E0B", css: "var(--warning)", use: "Attention and pending states" },
  { name: "Danger", hex: "#DC2626", css: "var(--destructive)", use: "Destructive and error states" },
] as const;

function ColorCard({
  name,
  hex,
  css,
  use,
}: {
  name: string;
  hex: string;
  css: string;
  use: string;
}) {
  return (
    <article className="overflow-hidden rounded-[var(--ui-radius-xl)] border border-border bg-card shadow-[var(--ui-shadow-sm)]">
      <div className="h-24" style={{ background: css }} aria-hidden />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">{name}</h3>
          <code className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{hex}</code>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{use}</p>
      </div>
    </article>
  );
}

export function ShaleanColorPaletteShowcase() {
  return (
    <section className="border-b border-border bg-background px-[var(--ui-page-gutter)] py-[var(--ui-space-10)] text-foreground">
      <div className="mx-auto w-full max-w-[var(--ui-container-wide)]">
        <div className="max-w-3xl">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className="rounded-full bg-[var(--navy-from)] px-3 py-1 text-white">SHALEAN BRAND</span>
            <span className="rounded-full border border-border px-3 py-1">Canonical palette</span>
            <span className="rounded-full border border-border px-3 py-1">Development reference</span>
          </div>
          <h1 className="mt-4 text-[length:var(--ui-text-page-title)] font-bold leading-[var(--ui-leading-tight)] tracking-tight">
            Shalean color palette
          </h1>
          <p className="mt-3 text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Use Shalean Navy and Royal for brand depth, Action Blue for interactive emphasis, restrained blue tints for selected surfaces, and the neutral/status colours below for product UI. Avoid introducing new marketing blues when one of these roles already fits.
          </p>
        </div>

        <div className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[length:var(--ui-text-section-title)] font-semibold">Core brand</h2>
              <p className="mt-1 text-sm text-muted-foreground">Primary Shalean identity and interaction colours.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {coreColors.map((color) => <ColorCard key={color.name} {...color} />)}
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
          <div>
            <h2 className="text-[length:var(--ui-text-section-title)] font-semibold">Neutrals</h2>
            <p className="mt-1 text-sm text-muted-foreground">Typography, surfaces, borders and low-emphasis UI.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {neutralColors.map((color) => <ColorCard key={color.name} {...color} />)}
            </div>
          </div>

          <div>
            <h2 className="text-[length:var(--ui-text-section-title)] font-semibold">System states</h2>
            <p className="mt-1 text-sm text-muted-foreground">Reserved for status meaning rather than decoration.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {stateColors.map((color) => <ColorCard key={color.name} {...color} />)}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[var(--ui-radius-xl)] border border-border bg-card p-5 shadow-[var(--ui-shadow-sm)]">
          <h2 className="text-sm font-semibold">Recommended header combination</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[var(--navy-from)] px-5 py-2.5 text-sm font-semibold text-white">Primary / Log in</span>
            <span className="rounded-full bg-[var(--navy-to)] px-5 py-2.5 text-sm font-semibold text-white">Hover / active</span>
            <span className="rounded-full bg-muted px-5 py-2.5 text-sm font-semibold text-foreground">Nav hover</span>
            <span className="rounded-full border-2 border-primary px-5 py-2.5 text-sm font-semibold text-foreground">Focus ring</span>
          </div>
        </div>
      </div>
    </section>
  );
}
