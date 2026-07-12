/**
 * Customer mobile typography — single source of truth for the app.
 * Tokens live in `@shalean/mobile-ui`; this module re-exports for local imports.
 *
 * Prefer `AppText` (className screens) or `textStyle(variant)` (StyleSheet / inline styles).
 * Never hardcode fontSize — never go below 12px. `AppText` enables Dynamic Type by default.
 *
 * Scale (iOS/Android a11y):
 * | Token              | Size | Weight | Line height | Use                    |
 * |--------------------|------|--------|-------------|------------------------|
 * | hero / display     | 28   | 700    | 36          | App title / hero       |
 * | title              | 24   | 600    | 32          | Screen titles          |
 * | section / heading  | 20   | 600    | 28          | Section headings       |
 * | card               | 18   | 600    | 24          | Card titles            |
 * | body               | 16   | 400    | 24          | Body copy              |
 * | bodyEmphasis       | 16   | 600    | 24          | Emphasized body        |
 * | secondary / caption| 14   | 400    | 20          | Descriptions           |
 * | label / overline   | 12   | 500    | 16          | Small labels (min)     |
 * | button             | 16   | 600    | 24          | Buttons (min H 48, r12)|
 * | tab                | 12   | 500    | 16          | Navigation tabs        |
 */
export {
  typography,
  textStyle,
  AppText,
  type AppTextVariant,
  type TypographyVariant,
} from "@shalean/mobile-ui";
