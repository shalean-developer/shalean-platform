export type OptimizeMetaContext = {
  location: string;
  city: string;
  service: string;
};

export type OptimizeMetaInput = {
  title: string;
  meta_title: string;
  meta_description: string;
};

const TITLE_SOFT = 58;
const DESC_SOFT = 155;

function trimWords(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  const base = sp > 40 ? cut.slice(0, sp) : cut;
  return base.replace(/[.,;:\s]+$/g, "").trimEnd();
}

function pickVariant(seed: string, variants: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return variants[h % variants.length]!;
}

export function optimizeMeta(input: OptimizeMetaInput, context: OptimizeMetaContext): OptimizeMetaInput {
  const loc = context.location.trim();
  const city = context.city.trim();
  const svc = context.service.trim();
  const seed = `${input.title}-${loc}`;

  const metaTitlePatterns = [
    `${svc} in ${loc}, ${city} | Book online`,
    `${loc} ${svc}: vetted cleaners | ${city}`,
    `${svc} ${loc} (${city}) | Shalean`,
  ];
  const meta_title = trimWords(pickVariant(seed, metaTitlePatterns), TITLE_SOFT);

  const descPatterns = [
    `Book ${svc.toLowerCase()} in ${loc}, ${city}. Clear scope, vetted cleaners, and simple scheduling with Shalean.`,
    `${svc} for ${loc} homes in ${city}: checklist-driven visits, transparent quotes at checkout, and dependable teams.`,
    `Need ${svc.toLowerCase()} near ${loc}? Shalean serves ${city} with structured cleans, online booking, and local-ready teams.`,
  ];
  const meta_description = trimWords(pickVariant(seed + "d", descPatterns), DESC_SOFT);

  const titlePatterns = [
    `${svc} in ${loc}, ${city} | Shalean`,
    `${svc} for ${loc} (${city}) | Shalean`,
    `${loc} ${svc} — ${city} | Shalean`,
  ];
  const title = trimWords(pickVariant(seed + "t", titlePatterns), TITLE_SOFT + 8);

  return { title, meta_title, meta_description };
}
