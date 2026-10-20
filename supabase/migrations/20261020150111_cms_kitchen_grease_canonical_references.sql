-- CMS-LINKS-02: correct two references in the reviewed kitchen-grease draft.
-- Preserve status, body, metadata and all other articles. No schema/auth changes.
DO $cms_link_repair$
DECLARE
  v_content jsonb;
  v_overrides text[];
  v_status text;
  v_rows integer;
BEGIN
  SELECT content_json, related_guide_override_slugs, status
    INTO v_content, v_overrides, v_status
  FROM public.blog_posts
  WHERE slug = 'remove-kitchen-grease-without-damaging-surfaces'
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Fresh/staging databases need not contain this production editorial row.
    RAISE NOTICE 'Reviewed CMS draft absent; no content changed';
    RETURN;
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Reviewed CMS post is no longer a draft; stop for review';
  END IF;
  IF md5(v_content::text) = 'ea8e865344a7417fcb20f2d39baec0e4'
    AND v_overrides = ARRAY['best-natural-cleaning-products', 'what-is-deep-cleaning', 'how-long-does-house-cleaning-take-cape-town']
  THEN
    RETURN;
  END IF;
  IF md5(v_content::text) IS DISTINCT FROM '26c461063bac3794bec7275f854f1301'
    OR v_content #>> '{blocks,20,links,1,url}' IS DISTINCT FROM '/blog/whats-included-deep-cleaning-cape-town'
    OR v_overrides IS DISTINCT FROM ARRAY['best-natural-cleaning-products', 'what-is-deep-cleaning', 'how-long-does-house-cleaning-take']
  THEN
    RAISE EXCEPTION 'Reviewed CMS draft changed; stop for review';
  END IF;

  PERFORM 1 FROM public.blog_posts
  WHERE slug IN ('whats-included-in-deep-cleaning-cape-town', 'how-long-does-house-cleaning-take-cape-town')
    AND status = 'published' AND content_json IS NOT NULL
  FOR SHARE;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'Both destination guides must remain published; stop for review';
  END IF;

  UPDATE public.blog_posts
  SET content_json = jsonb_set(v_content, '{blocks,20,links,1,url}', to_jsonb('/blog/whats-included-in-deep-cleaning-cape-town'::text), false),
      related_guide_override_slugs = ARRAY['best-natural-cleaning-products', 'what-is-deep-cleaning', 'how-long-does-house-cleaning-take-cape-town']
  WHERE slug = 'remove-kitchen-grease-without-damaging-surfaces'
    AND status = 'draft'
    AND content_json = v_content
    AND related_guide_override_slugs = v_overrides
  RETURNING content_json, related_guide_override_slugs, status INTO v_content, v_overrides, v_status;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1
    OR md5(v_content::text) IS DISTINCT FROM 'ea8e865344a7417fcb20f2d39baec0e4'
    OR v_overrides IS DISTINCT FROM ARRAY['best-natural-cleaning-products', 'what-is-deep-cleaning', 'how-long-does-house-cleaning-take-cape-town']
    OR v_status IS DISTINCT FROM 'draft'
  THEN
    RAISE EXCEPTION 'Expected exactly the reviewed two-reference draft repair';
  END IF;
END $cms_link_repair$;
