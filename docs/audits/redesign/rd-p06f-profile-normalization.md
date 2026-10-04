# RD-P06F — Profile normalization

Status: IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Validation base: `validation/rd-p06f-base` @ `30aa81367d0e392afa010f99d549521da0c6089d`
Scope: presentation-only normalization of `/account/profile`. No production deployment, Supabase schema/data mutation, auth/RBAC change, customer ownership change, booking/payment behavior change or real profile/password write is authorized by validation.

## Programme authority

RD-P06A defines Customer Account as the RD-P06 programme surface and establishes the approved implementation order. RD-P06E is closed at `30aa81367d0e392afa010f99d549521da0c6089d`. The next approved slice is RD-P06F — Profile normalization.

The Shalean Global Reusable UI System remains the presentation authority:

- repaired platform business logic remains authoritative;
- reuse shared primitives before creating route-local chrome;
- use semantic design tokens rather than route-local gray/blue/green/red styling;
- use shared `FormField` conventions for labels/helper text;
- keyboard/focus/label/error semantics are acceptance criteria;
- redesign remains isolated on `design/rd04-platform-redesign`;
- no production deployment or real data mutation is authorized by this slice.

## Preserved profile/write authority

The existing `/account/profile` write flow remains authoritative and is intentionally unchanged by RD-P06F.

### Identity and profile loading

Preserved:

- `useUser()` customer identity source;
- Supabase `user_profiles` lookup by authenticated `user.id`;
- existing fallback order between `user_profiles` and Auth user metadata;
- existing email source and read-only email behavior;
- existing booking/address/review/referral summary sources.

### Save contract

`onSave()` remains unchanged. It still:

1. updates Supabase Auth user metadata for `full_name`, `phone`, `whatsapp`, and `preferred_contact`;
2. normalizes the customer phone through `normalizeSouthAfricaPhone()`;
3. maps profile contact fields through `normalizeCustomerProfileContactFields()`;
4. maps preferred contact through `mapPreferredContactToNotificationChannel()`;
5. updates or inserts `user_profiles` for the authenticated user;
6. preserves `billing_email`, `phone`, `phone_e164`, preferred notification channel and optional `date_of_birth` targets;
7. optionally updates the Auth password only when a non-empty new password is supplied;
8. preserves the existing six-character minimum password check;
9. preserves existing success/error toast behavior.

No validation run may submit the profile form or change the password.

## Presentation normalization

### Page hierarchy

- preserves the existing `Profile` title and description;
- converts the profile summary hero to shared `Card` composition and semantic `primary` roles;
- adds safe wrapping for display name/email;
- keeps existing booking/completed/rating summary values unchanged.

### Overview metrics

- consolidates repeated route-local overview cards through an internal presentation-only `ProfileStat` composition built on shared `Card`;
- preserves total bookings, completed bookings, average rating and property counts exactly;
- keeps the 2-column mobile / 4-column larger layout.

### Primary property

- preserves the existing primary-address selection and displayed address fields;
- moves presentation to shared `Card` and semantic tokens;
- improves long-address wrapping without changing navigation or address authority.

### Personal information

- replaces direct route-local `Label` wrappers with shared `FormField` composition;
- preserves field ids, values, change handlers, input types and autocomplete behavior;
- preserves email disabled/read-only behavior and helper copy;
- preserves optional date-of-birth helper copy;
- preserves phone and WhatsApp field behavior.

### Preferred contact

- preserves the exact `whatsapp | email | phone` values and state update behavior;
- replaces custom route-local toggle styling with shared `Button` variants;
- adds `aria-pressed` and a labelled control group without changing submitted values.

### Referrals and rewards

- preserves all referral summary values and both existing destinations;
- replaces route-local styling with semantic card/muted/primary roles;
- improves link focus visibility and value wrapping.

### Password and security

- preserves the optional password field and existing six-character rule;
- moves field composition to shared `FormField` / `PasswordInput` presentation;
- preserves `autoComplete="new-password"` and helper copy;
- uses semantic destructive styling only for the security section icon treatment, not for behavior.

### Save action / help

- preserves the single `Save changes` submit action and busy state;
- removes route-local hard-coded blue button styling in favor of the shared primary button;
- preserves the existing `HelpCard` composition.

## Explicitly not changed

RD-P06F does not change:

- `onSave()` logic;
- Auth metadata keys or values;
- `user_profiles` read/write targets;
- insert/update branching;
- role/tier values used on profile insert;
- phone normalization;
- preferred-notification mapping;
- date-of-birth storage semantics;
- password validation or password update behavior;
- booking/address/review/referral queries;
- account shell/navigation/role guard;
- any API or Supabase schema;
- any production data.

## Validation gates

Before RD-P06F can close:

1. exact-head `web-test` must pass;
2. exact-head `migration-governance` must pass;
3. desktop `/account/profile` visual smoke must pass;
4. mobile `/account/profile` visual smoke must pass, including long content and bottom-nav clearance;
5. personal/contact/security fields must remain contained and labelled;
6. preferred-contact pressed state must be visually clear at desktop/mobile widths;
7. password visibility control must remain contained;
8. no horizontal page overflow may appear;
9. validation must be non-mutating — do not submit `Save changes` and do not change a password;
10. validation PR must be closed unmerged after closure evidence is recorded.

## Current governed state

RD-P06F is **IMPLEMENTED — CI / LOCAL VISUAL VALIDATION PENDING**.
