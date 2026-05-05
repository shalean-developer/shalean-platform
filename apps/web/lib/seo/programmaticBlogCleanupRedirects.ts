/**
 * Legacy programmatic `/blog/*` service×location URLs → 7 location hub slugs (where editorial hubs exist).
 * Canonical editorial guides (not redirected): `/blog/move-out-cleaning-rondebosch-cape-town`, `/blog/deep-cleaning-gardens-cape-town`, `/blog/luxury-home-cleaning-camps-bay-cape-town`, `/blog/regular-home-cleaning-wynberg-cape-town`, `/blog/affordable-cleaning-observatory-cape-town`, `/blog/home-cleaning-plumstead-cape-town`, `/blog/home-cleaning-constantia-cape-town`.
 * Thin “best cleaning services in {area}” clones → `/blog/cleaning-services-{area}-cape-town` via `middleware.ts` (not listed here).
 * Enable after hub rows exist in `blog_posts` as published.
 */
export const programmaticBlogCleanupRedirects = [
  {
    source: "/blog/deep-cleaning-claremont-cape-town",
    destination: "/blog/cleaning-services-claremont-cape-town",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-claremont-cape-town",
    destination: "/blog/cleaning-services-claremont-cape-town",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-claremont-cape-town",
    destination: "/blog/cleaning-services-claremont-cape-town",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-claremont-cape-town",
    destination: "/blog/cleaning-services-claremont-cape-town",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-claremont-cape-town",
    destination: "/blog/cleaning-services-claremont-cape-town",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-sea-point-cape-town",
    destination: "/blog/cleaning-services-sea-point-cape-town",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-sea-point-cape-town",
    destination: "/blog/cleaning-services-sea-point-cape-town",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-sea-point-cape-town",
    destination: "/blog/cleaning-services-sea-point-cape-town",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-sea-point-cape-town",
    destination: "/blog/cleaning-services-sea-point-cape-town",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-sea-point-cape-town",
    destination: "/blog/cleaning-services-sea-point-cape-town",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-rondebosch-cape-town",
    destination: "/blog/cleaning-services-rondebosch-cape-town",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-rondebosch-cape-town",
    destination: "/blog/cleaning-services-rondebosch-cape-town",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-rondebosch-cape-town",
    destination: "/blog/cleaning-services-rondebosch-cape-town",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-rondebosch-cape-town",
    destination: "/blog/cleaning-services-rondebosch-cape-town",
    permanent: true,
  },

  {
    source: "/blog/airbnb-cleaning-gardens-cape-town",
    destination: "/blog/cleaning-services-gardens-cape-town",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-gardens-cape-town",
    destination: "/blog/cleaning-services-gardens-cape-town",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-gardens-cape-town",
    destination: "/blog/cleaning-services-gardens-cape-town",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-gardens-cape-town",
    destination: "/blog/cleaning-services-gardens-cape-town",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-wynberg-cape-town",
    destination: "/blog/cleaning-services-wynberg-cape-town",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-wynberg-cape-town",
    destination: "/blog/cleaning-services-wynberg-cape-town",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-wynberg-cape-town",
    destination: "/blog/cleaning-services-wynberg-cape-town",
    permanent: true,
  },
  {
    source: "/blog/standard-cleaning-wynberg-cape-town",
    destination: "/blog/cleaning-services-wynberg-cape-town",
    permanent: true,
  },
  {
    source: "/blog/carpet-cleaning-wynberg-cape-town",
    destination: "/blog/cleaning-services-wynberg-cape-town",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-green-point-cape-town",
    destination: "/blog/cleaning-services-green-point-cape-town",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-green-point-cape-town",
    destination: "/blog/cleaning-services-green-point-cape-town",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-green-point-cape-town",
    destination: "/blog/cleaning-services-green-point-cape-town",
    permanent: true,
  },

  {
    source: "/blog/deep-cleaning-durbanville-cape-town",
    destination: "/blog/cleaning-services-durbanville-cape-town",
    permanent: true,
  },
  {
    source: "/blog/airbnb-cleaning-durbanville-cape-town",
    destination: "/blog/cleaning-services-durbanville-cape-town",
    permanent: true,
  },
  {
    source: "/blog/move-out-cleaning-durbanville-cape-town",
    destination: "/blog/cleaning-services-durbanville-cape-town",
    permanent: true,
  },
] as const;
