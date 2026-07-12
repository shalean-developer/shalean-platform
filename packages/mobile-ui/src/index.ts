/**
 * @shalean/mobile-ui — shared React Native UI kit for Shalean Expo apps.
 *
 * Peer deps: react, react-native, nativewind, @expo/vector-icons,
 * react-native-safe-area-context, expo-haptics (optional at runtime).
 *
 * Apps must include this package in Tailwind `content` paths.
 */

export { AppButton } from "./AppButton";
export { AppText } from "./AppText";
export type { AppTextVariant } from "./AppText";
export { TextField } from "./TextField";
export { SectionCard } from "./SectionCard";
export { ListRow } from "./ListRow";
export { ErrorState, LoadingState, EmptyState } from "./StateViews";
export { Screen } from "./Screen";
export { StatusBadge } from "./StatusBadge";
export type { StatusTone } from "./StatusBadge";
export { ProgressBar } from "./ProgressBar";
export { Avatar, AvatarOnlineDot } from "./Avatar";
export { Skeleton, JobCardSkeleton, DashboardSkeleton } from "./Skeleton";
export { PlaceholderScreen } from "./PlaceholderScreen";
export { AppErrorBoundary } from "./AppErrorBoundary";

export {
  colors,
  spacing,
  radius,
  typography,
  textStyle,
  shadows,
  touchTarget,
  iconSize,
} from "./theme";
export type { TypographyVariant } from "./theme";
