import "server-only";

export type SerpRequest = {
  keyword: string;
  locationName: string;
  languageCode: string;
  device: "desktop" | "mobile";
};

export type SerpResultItem = {
  position: number;
  url: string;
  title: string | null;
  domain: string;
  type: string;
};

export type SerpResponse = {
  provider: string;
  items: SerpResultItem[];
  raw: unknown;
};

export interface SerpProvider {
  name: string;
  search(request: SerpRequest): Promise<SerpResponse>;
}

function hostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

class DataForSeoProvider implements SerpProvider {
  name = "dataforseo";
  private login: string;
  private password: string;

  constructor(login: string, password: string) {
    this.login = login;
    this.password = password;
  }

  async search(request: SerpRequest): Promise<SerpResponse> {
    const auth = Buffer.from(`${this.login}:${this.password}`).toString("base64");
    const response = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{
        keyword: request.keyword,
        location_name: request.locationName,
        language_code: request.languageCode,
        device: request.device,
        depth: 100,
      }]),
      cache: "no-store",
    });

    const raw = await response.json();
    if (!response.ok) throw new Error(`DataForSEO request failed (${response.status}).`);
    const task = raw?.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      throw new Error(task?.status_message || "DataForSEO returned an unsuccessful task status.");
    }

    const sourceItems = task?.result?.[0]?.items ?? [];
    const items: SerpResultItem[] = sourceItems.flatMap((item: any) => {
      if (item?.type !== "organic" || typeof item?.url !== "string") return [];
      const domain = hostname(item.url);
      const position = Number(item.rank_absolute ?? item.rank_group);
      if (!domain || !Number.isFinite(position) || position <= 0) return [];
      return [{
        position,
        url: item.url,
        title: typeof item.title === "string" ? item.title : null,
        domain,
        type: "organic",
      }];
    });

    return { provider: this.name, items, raw };
  }
}

export function getSerpProvider(): SerpProvider | null {
  const provider = (process.env.SEO_SERP_PROVIDER || "dataforseo").trim().toLowerCase();
  if (provider === "dataforseo") {
    const login = process.env.DATAFORSEO_LOGIN?.trim();
    const password = process.env.DATAFORSEO_PASSWORD?.trim();
    return login && password ? new DataForSeoProvider(login, password) : null;
  }
  return null;
}
