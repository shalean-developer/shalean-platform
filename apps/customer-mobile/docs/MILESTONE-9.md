# Milestone 9 — Profile

## What shipped

### New APIs (`apps/web`)
- `GET` / `PATCH` `/api/customer/profile`
- `GET` / `POST` `/api/customer/addresses`
- `GET` / `PATCH` / `DELETE` `/api/customer/addresses/[id]`
- `GET` `/api/customer/invoices` (monthly + per-visit)
- Bearer PDF: `/api/customer/invoices/monthly/[id]/pdf`, `/api/customer/invoices/booking/[bookingId]/pdf`

Authz: Bearer JWT; `user_id` / `customer_id` always from token; foreign rows → **404**.

### Mobile
- Profile hub with edit, properties, invoices entry
- Address CRUD screens
- Invoices list + Pay link + PDF viewer (Bearer fetch → WebView)
- `@shalean/api-client`: `createCustomerProfileApi`, `createCustomerAddressesApi`, `createCustomerInvoicesApi`

## Tests

```bash
cd apps/web
npx vitest run lib/customer/__tests__/customerAddressesAuthz.test.ts lib/customer/__tests__/customerProfileInvoicesAuthz.test.ts

cd apps/customer-mobile
npm run typecheck
npm run test:profile
```

## Manual QA

- [ ] Edit profile saves name/phone/preferred contact
- [ ] Add / edit / delete address; default clears siblings
- [ ] Other user’s address id → unavailable
- [ ] Invoices list shows monthly + per-visit
- [ ] Pay balance opens payment link
- [ ] PDF opens when Zoho id present; 404/unavailable otherwise

## Not in this milestone

- Notification inbox / push tokens (M10)
- Changing email/password via profile PATCH
