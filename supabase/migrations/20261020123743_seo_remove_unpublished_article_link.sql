-- SEO-LIVE-LINKS-01: remove one link to a draft from one published article.
-- No schema, booking, payment, notification or draft-content changes.
DO $seo_link$
DECLARE
  v_content jsonb;
  v_status text;
  v_rows integer;
BEGIN
  SELECT content_json, status INTO v_content, v_status
  FROM public.blog_posts
  WHERE slug = 'cleaning-mistakes-cape-town-homeowners'
  FOR UPDATE;

  -- Fresh/staging databases need not contain this production editorial row.
  IF NOT FOUND THEN
    RAISE NOTICE 'SEO source absent; no CMS content changed';
    RETURN;
  END IF;
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'SEO source is no longer published; re-audit before applying';
  END IF;
  IF md5(v_content::text) = 'bde0cf46162b57b84b221cd066e29f52' THEN
    RAISE NOTICE 'SEO link already corrected; no CMS content changed';
    RETURN;
  END IF;
  IF md5(v_content::text) IS DISTINCT FROM '67c205926d0be799d7d31e92d888005f'
    OR v_content #>> '{blocks,3,type}' IS DISTINCT FROM 'internal_links'
    OR v_content #>> '{blocks,3,links,4,url}' IS DISTINCT FROM '/blog/remove-kitchen-grease-without-damaging-surfaces'
  THEN
    RAISE EXCEPTION 'SEO source changed; re-audit before applying';
  END IF;

  SELECT status INTO v_status
  FROM public.blog_posts
  WHERE slug = 'remove-kitchen-grease-without-damaging-surfaces'
  FOR SHARE;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'SEO destination is no longer the reviewed draft';
  END IF;

  UPDATE public.blog_posts
  SET content_json = v_content #- '{blocks,3,links,4}'
  WHERE slug = 'cleaning-mistakes-cape-town-homeowners'
    AND content_json = v_content
  RETURNING content_json INTO v_content;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 OR md5(v_content::text) IS DISTINCT FROM 'bde0cf46162b57b84b221cd066e29f52' THEN
    RAISE EXCEPTION 'Expected exactly the reviewed single-link CMS correction';
  END IF;
END $seo_link$;
