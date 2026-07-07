-- SEO: replace legacy /booking internal links with canonical /book (booking-v2 hub).
-- /booking and /booking/* server-redirect; crawlers flag internal links that hit redirects.
-- Longer paths first so /booking/details is not partially replaced.

UPDATE public.blog_posts
SET
  content_json = replace(
    replace(
      replace(
        replace(
          replace(
            replace(content_json::text, '](/booking/details)', '](/book)'),
            '"link":"/booking/details"',
            '"link":"/book"'
          ),
          '"link": "/booking/details"',
          '"link": "/book"'
        ),
        '](/booking)',
        '](/book)'
      ),
      '"link":"/booking"',
      '"link":"/book"'
    ),
    '"link": "/booking"',
    '"link": "/book"'
  )::jsonb,
  updated_at = now()
WHERE content_json::text ~ '](/booking|"/booking)';
