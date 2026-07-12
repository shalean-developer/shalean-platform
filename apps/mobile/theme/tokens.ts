/**
 * Compatibility shim — tokens live in `@shalean/mobile-ui`.
 * Cleaner-specific surface tint historically used a greener canvas; shared
 * tokens use the customer-aligned `#f4f6f8` surface (visually near-identical).
 */
export {
  colors,
  spacing,
  radius,
  typography,
  textStyle,
  shadows,
  touchTarget,
  iconSize,
} from "@shalean/mobile-ui/theme";
