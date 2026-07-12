-- Campaign social creative uploads + expand allowed asset types.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-media',
  'campaign-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow newer export sizes used by the social design system.
alter table public.campaign_assets
  drop constraint if exists campaign_assets_asset_type_check;

alter table public.campaign_assets
  add constraint campaign_assets_asset_type_check
  check (asset_type in (
    'facebook_feed',
    'instagram_feed',
    'instagram_portrait',
    'instagram_story',
    'facebook_story',
    'whatsapp_status',
    'linkedin_banner',
    'twitter_image',
    'pinterest_pin',
    'google_business_cover',
    'widescreen_banner',
    'qr_code',
    'hero',
    'banner',
    'logo',
    'other'
  ));
