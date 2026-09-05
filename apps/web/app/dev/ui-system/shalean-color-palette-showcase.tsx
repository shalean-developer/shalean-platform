const coreColors = [
  { name: "Shalean Primary", hex: "#6382F7", css: "var(--primary)", use: "Primary brand and action colour" },
  { name: "Shalean Navy", hex: "#0D1B69", css: "var(--navy-from)", use: "Supporting brand depth and dark accents" },
  { name: "Shalean Royal", hex: "#1A3DBD", css: "var(--navy-to)", use: "Supporting emphasis and deeper blue states" },
  { name: "Blue Mist", hex: "#DBEAFE", css: "#DBEAFE", use: "Soft selected states and brand-tinted cards" },
  { name: "Blue Ice", hex: "#EFF6FF", css: "#EFF6FF", use: "Very light brand-tinted surfaces" },
] as const;

const marketingCompanionColors = [
  { name: "Soft Periwinkle", hex: "#B8C5FF", css: "#B8C5FF", use: "Balanced secondary marketing card surface" },
  { name: "Powder Blue", hex: "#C9D8FF", css: "#C9D8FF", use: "Mid-strength blue surface for process and trust cards" },
  { name: "Sky Mist", hex: "#DDEBFF", css: "#DDEBFF", use: "Soft blue surface for supporting proof and content blocks" },
  { name: "Blue Ice", hex: "#EFF6FF", css: "#EFF6FF", use: "Low-emphasis brand-tinted section and card surface" },
  { name: "Cool Cloud", hex: "#F4F6FA", css: "#F4F6FA", use: "Neutral cool marketing section surface" },
  { name: "White", hex: "#FFFFFF", css: "#FFFFFF", use: "Primary page and clean card surface" },
] as const;

const neutralColors = [
  { name: "Ink", hex: "#171717", css: "var(--foreground)", use: "Primary text and accessible text on Primary" },
  { name: "Slate", hex: "#71717A", css: "var(--muted-foreground)", use: "Secondary text" },
  { name: "Cloud", hex: "#F4F4F5", css: "var(--muted)", use: "Soft product surfaces and hover states" },
  { name: "Border", hex: "#E4E4E7", css: "var(--border)", use: "Dividers and input outlines" },
  { name: "White", hex: "#FFFFFF", css: "var(--background)", use: "Primary page and card surface" },
] as const;

const stateColors = [
  { name: "Success", hex: "#059669", css: "var(--success)", use: "Confirmed and completed states" },
  { name: "Warning", hex: "#F59E0B", css: "var(--warning)", use: "Attention and pending states" },
  { name: "Danger", hex: "#DC2626", css: "var(--destructive)", use: "Destructive and error states" },
] as const;

function ColorCard({ name, hex, css, use }: { name: string; hex: string; css: string; use: string }) {
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
            <span className="rounded-full bg-primary px-3 py-1 text-primary-foreground">SHALEAN BRAND</span>
            <span className="rounded-full border border-border px-3 py-1">Canonical palette</span>
            <span className="rounded-full border border-border px-3 py-1">Development reference</span>
          </div>
          <h2 className="mt-4 text-[length:var(--ui-text-page-title)] font-bold leading-[var(--ui-leading-tight)] tracking-tight">Shalean color palette</h2>
          <p className="mt-3 text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
            Shalean Primary (#6382F7) is the main brand/action colour. Navy and Royal provide depth; the official homepage marketing palette stays within the Shalean blue family through Soft Periwinkle, Powder Blue, Sky Mist, Blue Ice, Cool Cloud and White.
          </p>
        </div>

        <div className="mt-8">
          <div className="mb-3">
            <h2 className="text-[length:var(--ui-text-section-title)] font-semibold">Core brand</h2>
            <p className="mt-1 text-sm text-muted-foreground">Primary Shalean identity and supporting blue roles.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {coreColors.map((color) => <ColorCard key={color.name} {...color} />)}
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-3">
            <h2 className="text-[length:var(--ui-text-section-title)] font-semibold">Official homepage marketing palette</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use these cool blue and neutral surfaces for homepage storytelling. Warm Sand, pink, lavender and teal are not part of the default Shalean homepage palette.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {marketingCompanionColors.map((color) => <ColorCard key={`${color.name}-${color.hex}`} {...color} />)}
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
            <span className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Primary / Log in</span>
            <span className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground brightness-95">Primary hover</span>
            <span className="rounded-full bg-muted px-5 py-2.5 text-sm font-semibold text-foreground">Nav hover</span>
            <span className="rounded-full border-2 border-primary px-5 py-2.5 text-sm font-semibold text-foreground">Focus ring</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Use dark Ink text on Shalean Primary for small controls; white text does not provide enough contrast at normal button-text sizes on #6382F7.
          </p>
        </div>
      </div>
    </section>
  );
}
