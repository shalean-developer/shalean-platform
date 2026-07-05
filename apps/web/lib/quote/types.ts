export type QuoteCatalogSelection = {
  kind: "service" | "extra";
  slug: string;
  name: string;
  quantity: number;
};

export type QuotePublicServiceExtra = {
  id: string;
  slug: string;
  name: string;
  is_popular: boolean;
};

export type QuotePublicService = {
  id: string;
  slug: string;
  name: string;
  extras: QuotePublicServiceExtra[];
};

export type QuotePublicExtra = {
  id: string;
  slug: string;
  name: string;
  service_type: string;
  is_popular: boolean;
};
