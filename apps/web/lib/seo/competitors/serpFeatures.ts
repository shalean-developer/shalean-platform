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

function dataForSeoFeatures(raw: any): NormalizedSerpFeature[] {
  const output: NormalizedSerpFeature[] = [];
  const items = raw?.tasks?.[0]?.result?.[0]?.items ?? [];
  for (const item of items) {
    const type = String(item?.type ?? "").toLowerCase();
    const common = {
      url: item?.url,
      title: item?.title,
      position: item?.rank_absolute ?? item?.rank_group,
    };
    if (type === "featured_snippet") pushFeature(output, "featured_snippet", common);
    else if (type === "local_pack" || type === "maps") {
      const packItems = Array.isArray(item?.items) ? item.items : [];
      if (!packItems.length) pushFeature(output, "local_pack", common);
      for (const child of packItems) pushFeature(output, "local_pack", { url: child?.url ?? child?.website, title: child?.title ?? child?.name, position: child?.rank_absolute ?? child?.rank_group ?? common.position });
    } else if (type === "people_also_ask") pushFeature(output, "people_also_ask", common);
    else if (type === "images" || type === "images_element") pushFeature(output, "images", common);
    else if (type === "video" || type === "videos" || type === "video_element") pushFeature(output, "video", common);
    else if (type === "ai_overview") pushFeature(output, "ai_overview", common);
    else if (type === "knowledge_graph" || type === "knowledge_panel") pushFeature(output, "knowledge_panel", common);
  }
  return output;
}

function serpApiFeatures(raw: any): NormalizedSerpFeature[] {
  const output: NormalizedSerpFeature[] = [];
  const answerBox = raw?.answer_box;
  if (answerBox) pushFeature(output, "featured_snippet", { url: answerBox.link ?? answerBox.source?.link, title: answerBox.title ?? answerBox.answer, position: 1 });

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
    for (const image of images.slice(0, 10)) pushFeature(output, "images", { url: image?.source ?? image?.link, title: image?.title, position: image?.position });
  }

  const videos = raw?.video_results ?? raw?.inline_videos ?? [];
  if (Array.isArray(videos) && videos.length) {
    for (const video of videos.slice(0, 10)) pushFeature(output, "video", { url: video?.link, title: video?.title, position: video?.position });
  }

  const ai = raw?.ai_overview;
  if (ai) {
    const sources = ai?.references ?? ai?.sources ?? [];
    if (Array.isArray(sources) && sources.length) {
      for (const source of sources.slice(0, 10)) pushFeature(output, "ai_overview", { url: source?.link, title: source?.title, position: 1 });
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
