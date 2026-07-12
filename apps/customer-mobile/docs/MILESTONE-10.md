# Milestone 10 — Notifications

## What shipped

### New APIs (`apps/web`)
- `GET` `/api/customer/notifications` → `{ notifications, unreadCount }`
- `POST` `/api/customer/notifications/mark-read` → `{ id }` or `{ all: true }`
- `POST` / `DELETE` `/api/customer/devices` → Expo push token register / unregister

Authz: Bearer JWT; `user_id` always from token (body `user_id` / `userId` stripped); foreign notification ids → **404**.

### Migration
- `supabase/migrations/20261068_user_push_tokens.sql` — `user_push_tokens` + RLS (own rows)

### Mobile
- `expo-notifications` + `expo-device`; plugin in `app.config.ts`
- `NotificationProvider` — permission, Expo token, `POST /api/customer/devices`, tap + cold-start routing
- Inbox: `/profile/notifications` (mark one / mark all)
- Profile hub shows unread count
- Deep-link resolver: `booking_id` → detail; en-route/arrived → track; safe `path` only

### api-client
- `createCustomerNotificationsApi`, `createCustomerDevicesApi`

## Tests

```bash
cd apps/web
npx vitest run lib/customer/__tests__/customerNotificationsDevices.test.ts

cd apps/customer-mobile
npm run typecheck
npm run test:notifications
```

## Manual QA

- [ ] Signed-in physical device: OS permission → token stored → `POST /api/customer/devices` succeeds
- [ ] Simulator / web: soft-fail (no crash)
- [ ] Inbox lists notifications; mark one / mark all updates unread
- [ ] Tap push with `booking_id` opens booking detail
- [ ] Tap push with `type: en_route` (+ booking) opens track
- [ ] Cold-start from notification tap routes correctly
- [ ] Sign-out best-effort unregisters token

## Risks / notes

- **Expo push credentials:** device delivery needs a dedicated EAS project (`EXPO_PUBLIC_EAS_PROJECT_ID`) and push credentials — do not reuse the Cleaner project.
- Notification preference toggles are P1 (not in this milestone).

## Not in this milestone

- Sending push from server jobs (outbound already exists on web; this milestone is inbox + token register + tap handlers)
- Preference settings UI
