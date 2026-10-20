-- SEO-LIVE-LINKS-01: remove one published link to an unpublished article.
-- Default is a rollback rehearsal. Apply only after isolated/staging review,
-- fresh source/draft verification, and explicit production release authority.
-- Source content must still match the reviewed 20 October 2026 snapshot.
BEGIN;

DO $seo_link$
DECLARE
  v_content jsonb;
  v_rows integer;
BEGIN
  SELECT content_json INTO STRICT v_content
  FROM public.blog_posts
  WHERE id = '0b12d13c-5bb5-4f9a-b656-3029ecbd63fe'
    AND slug = 'cleaning-mistakes-cape-town-homeowners'
    AND status = 'published'
  FOR UPDATE;

  IF md5(v_content::text) <> '67c205926d0be799d7d31e92d888005f'
    OR v_content #>> '{blocks,3,id}' IS DISTINCT FROM 'f54f1869-7177-46e5-9c6e-ee0426510ad1'
    OR v_content #>> '{blocks,3,links,4,url}' IS DISTINCT FROM '/blog/remove-kitchen-grease-without-damaging-surfaces'
  THEN
    RAISE EXCEPTION 'SEO source changed; re-audit before applying';
  END IF;

  -- Do not remove the link if its destination has since been published.
  PERFORM 1 FROM public.blog_posts
  WHERE id = 'dea38da7-8ef4-4fa2-8a8a-2098594c3f96'
    AND slug = 'remove-kitchen-grease-without-damaging-surfaces'
    AND status = 'draft'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SEO destination is no longer the reviewed draft';
  END IF;

  UPDATE public.blog_posts
  SET content_json = v_content #- '{blocks,3,links,4}'
  WHERE id = '0b12d13c-5bb5-4f9a-b656-3029ecbd63fe'
    AND content_json = v_content;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one CMS article correction, got %', v_rows;
  END IF;
END;
$seo_link$;

SELECT slug, md5(content_json::text) AS content_hash,
       jsonb_array_length(content_json #> '{blocks,3,links}') AS remaining_helpful_links
FROM public.blog_posts
WHERE id = '0b12d13c-5bb5-4f9a-b656-3029ecbd63fe';

ROLLBACK;
