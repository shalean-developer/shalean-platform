# SEO-017 Competitor Intelligence

SEO Management can track Shalean against competitors for strategic Google queries by location and device.

## Provider configuration

Choose one provider:

### DataForSEO

```env
SEO_SERP_PROVIDER=dataforseo
DATAFORSEO_LOGIN=...
DATAFORSEO_PASSWORD=...
```

### SerpApi

```env
SEO_SERP_PROVIDER=serpapi
SERPAPI_API_KEY=...
```

If no provider is configured, the Competitors workspace remains usable for competitor and keyword management, but scheduled SERP collection returns a configuration error and makes no paid external request.

## Schedule

`seo-competitors` runs daily at 06:45 through Supabase pg_cron and `/api/cron/seo-competitors`. Each run processes at most 50 active tracked keywords.

Provider usage may incur external API charges. Keep the keyword portfolio intentionally scoped and disable keywords that no longer need daily tracking.

## Workspace

Office → SEO Management → Competitors

The workspace supports:
- manual competitor addition;
- tracked keywords with target page, priority, location and device;
- latest Shalean vs competitor positions;
- share of voice based on latest observed rankings;
- automatic discovery of recurring domains in tracked SERPs;
- Add / Ignore decisions for discovered competitors;
- scheduled SERP snapshot history and automation logging.
