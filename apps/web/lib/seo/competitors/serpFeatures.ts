import "server-only";

export type SerpFeatureType =
  | "featured_snippet"
  | "local_pack"
  | "people_also_ask"
  | "images"
  | "video"
  | "ai_overview"
  | "knowledge_panel"
  | "other";

export type NormalizedSerpFeature = {
  featureType: SerpFeatureType;
  ownerDomain: string | null;
  url: string | null;
  title: string | null;
  position: number | null;
};

function domainFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pushFeature(
  output: NormalizedSerpFeature[],
  featureType: SerpFeatureType,
  input: { url?: unknown; title?: unknown; position?: unknown } = {},
) {
  const url = textOrNull(input.url);
  output.push({
    featureType,
    ownerDomain: domainFromUrl(url),
    url,
    title: textOrNull(input.title),
    position: numberOrNull(input.position),
  });
}

function collectNestedSources(value: unknown, depth = 0): Array<{url:unknown;title:unknown;position:unknown}> {
  if (depth > 6 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectNestedSources(item, depth + 1));
  if (typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const url = record.url ?? record.link ?? record.website ?? record.source_url;
  const title = record.title ?? record.name ?? record.question ?? record.text;
  const position = record.rank_absolute ?? record.rank_group ?? record.position;
  const rows: Array<{url:unknown;title:unknown;position:unknown}> = [];
  if (textOrNull(url)) rows.push({ url, title, position });
  for (const key of ["items","references","sources","links","results","elements","answers"]) {
    if (record[key] != null) rows.push(...collectNestedSources(record[key], depth + 1));
  }
  return rows;
}

function pushContainerFeature(output:NormalizedSerpFeature[], featureType:SerpFeatureType, item:any, fallbackPosition:unknown) {
  const children = collectNestedSources(item).filter((row) => textOrNull(row.url));
  if (children.length) {
    for (const child of children) pushFeature(output, featureType, { url:child.url, title:child.title, position:child.position ?? fallbackPosition });
    return;
  }
  pushFeature(output, featureType, { url:item?.url, title:item?.title, position:fallbackPosition });
}

function dataForSeoFeatures(raw: any): NormalizedSerpFeature[] {
  const output: NormalizedSerpFeature[] = [];
  const items = raw?.tasks?.[0]?.result?.[0]?.items ?? [];
  for (const item of items) {
    const type = String(item?.type ?? "").toLowerCase();
    const position = item?.rank_absolute ?? item?.rank_group;
    const common = { url: item?.url, title: item?.title, position };
    if (type === "featured_snippet") pushContainerFeature(output, "featured_snippet", item, position);
    else if (type === "local_pack" || type === "maps") pushContainerFeature(output, "local_pack", item, position);
    else if (type === "people_also_ask") pushContainerFeature(output, "people_also_ask", item, position);
    else if (type === "images" || type === "images_element") pushContainerFeature(output, "images", item, position);
    else if (type === "video" || type === "videos" || type === "video_element") pushContainerFeature(output, "video", item, position);
    else if (type === "ai_overview") pushContainerFeature(output, "ai_overview", item, position);
    else if (type === "knowledge_graph" || type === "knowledge_panel") pushFeature(output, "knowledge_panel", common);
  }
  return output;
}

function isSerpApiFeaturedSnippet(answerBox:any):boolean {
  if (!answerBox || typeof answerBox !== "object") return false;
  const type = String(answerBox.type ?? answerBox.answer_type ?? "").toLowerCase();
  if (["calculator","weather","dictionary","conversion","currency","time","sports_results"].some((value)=>type.includes(value))) return false;
  if (type.includes("featured") || type.includes("organic")) return true;
  return Boolean(answerBox.link && (answerBox.snippet || answerBox.displayed_link || answerBox.highlighted_words));
}

function serpApiFeatures(raw: any): NormalizedSerpFeature[] {
  const output: NormalizedSerpFeature[] = [];
  const answerBox = raw?.answer_box;
  if (isSerpApiFeaturedSnippet(answerBox)) pushFeature(output, "featured_snippet", { url: answerBox.link ?? answerBox.source?.link, title: answerBox.title ?? answerBox.answer, position: 1 });

  const localResults = raw?.local_results?.places ?? raw?.local_results ?? [];
  if (Array.isArray(localResults) && localResults.length) {
    for (const place of localResults) pushFeature(output, "local_pack", { url: place?.website ?? place?.link, title: place?.title ?? place?.name, position: place?.position });
  }

  const paa = raw?.related_questions ?? [];
  if (Array.isArray(paa) && paa.length) {
    for (const question of paa) pushFeature(output, "people_also_ask", { url: question?.link, title: question?.question ?? question?.title, position: question?.position });
  }

  const images = raw?.inline_images ?? raw?.images_results ?? [];
  if (Array.isArray(images) && images.length) {
    for (const image of images.slice(0, 10)) pushFeature(output, "images", { url: image?.link ?? image?.source?.link, title: image?.title ?? image?.source, position: image?.position });
  }

  const videos = raw?.video_results ?? raw?.inline_videos ?? [];
  if (Array.isArray(videos) && videos.length) {
    for (const video of videos.slice(0, 10)) pushFeature(output, "video", { url: video?.link, title: video?.title, position: video?.position });
  }

  const ai = raw?.ai_overview;
  if (ai) {
    const sources = ai?.references ?? ai?.sources ?? [];
    if (Array.isArray(sources) && sources.length) {
      for (const source of sources.slice(0, 10)) pushFeature(output, "ai_overview", { url: source?.link ?? source?.url, title: source?.title, position: 1 });
    } else pushFeature(output, "ai_overview", { title: ai?.text ?? ai?.snippet, position: 1 });
  }

  const knowledge = raw?.knowledge_graph;
  if (knowledge) pushFeature(output, "knowledge_panel", { url: knowledge?.website, title: knowledge?.title, position: 1 });
  return output;
}

export function normalizeSerpFeatures(provider: string, raw: unknown): NormalizedSerpFeature[] {
  const normalized = provider === "serpapi" ? serpApiFeatures(raw) : dataForSeoFeatures(raw);
  const seen = new Set<string>();
  return normalized.filter((feature) => {
    const key = [feature.featureType, feature.ownerDomain ?? "", feature.url ?? "", feature.title ?? "", feature.position ?? ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
