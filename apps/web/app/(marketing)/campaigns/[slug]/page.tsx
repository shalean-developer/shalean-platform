import { permanentRedirect } from "next/navigation";

type SearchParamValue = string | string[] | undefined;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
};

function serializeSearchParams(values: Record<string, SearchParamValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value != null) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function LegacyCampaignRedirect({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (!slug?.trim()) permanentRedirect("/book");

  const suffix = serializeSearchParams(query);
  permanentRedirect(`/offers/${encodeURIComponent(slug)}${suffix}`);
}
