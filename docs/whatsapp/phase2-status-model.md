# WhatsApp Phase 2 status model

Office template readiness should expose separate states rather than treating `templates.is_active` as proof that Meta can send the template.

Recommended fields for WhatsApp rows:

- `internal_active`: current Supabase `templates.is_active` value.
- `meta_template_name`: resolved non-secret Meta template name used by the sender.
- `meta_configured`: whether a non-empty Meta name is configured/resolvable.
- `approval_status`: `unknown | pending | approved | rejected` until a Meta management API sync is added.
- `send_ready`: true only when internally active, configured, and approval status is approved.

Until Meta management API status sync exists, approval must remain `unknown`; the UI must never claim a template is approved based on DB activation or a successful text-message test.
