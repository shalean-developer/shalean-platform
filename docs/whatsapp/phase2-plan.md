# WhatsApp Phase 2 — Meta template integration

This branch is intentionally stacked on `feat/whatsapp-template-catalog` (PR #196).

## Scope

1. Surface WhatsApp template readiness in Office → Message Templates.
2. Distinguish internal activation from Meta approval/configuration.
3. Add environment mapping visibility for Meta template aliases without exposing secrets.
4. Keep all new proactive lifecycle templates fail-closed until Meta approval is confirmed.
5. Preserve current text-message behavior for open 24-hour customer-service windows.
6. Prepare controlled template test-send support using exact Meta template names and parameter order.

## Dependency order

- PR #197 is the independent urgent queue schema fix and should merge first when green.
- PR #196 provides the canonical WhatsApp template catalogue.
- Phase 2 lands after #196 so it can rely on that catalogue.

## Safety rules

- Do not auto-activate templates merely because a DB row exists.
- Do not infer Meta approval from a successful text send.
- Do not expose `WHATSAPP_ACCESS_TOKEN` or any provider secret in admin APIs/UI.
- Template send must use the exact approved Meta name, language, and body parameter order.
