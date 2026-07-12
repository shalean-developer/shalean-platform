import type { ComponentProps, ReactNode } from "react";
import { Screen as BaseScreen } from "@shalean/mobile-ui";
import { OfflineBanner } from "@/components/OfflineBanner";

type BaseProps = ComponentProps<typeof BaseScreen>;

type Props = Omit<BaseProps, "banner"> & {
  /** Show offline / queue banner at top (Cleaner connectivity). */
  showOfflineBanner?: boolean;
  banner?: ReactNode;
};

/**
 * Cleaner Screen wrapper — injects OfflineBanner by default.
 * Shared chrome lives in `@shalean/mobile-ui`.
 */
export function Screen({
  showOfflineBanner = true,
  banner,
  ...rest
}: Props) {
  const resolvedBanner =
    banner !== undefined ? banner : showOfflineBanner ? <OfflineBanner /> : null;

  return <BaseScreen {...rest} banner={resolvedBanner} />;
}
