import type { ReactNode } from "react";
import styles from "../../../office/seo-insights/seo-command-centre.module.css";

export default function SeoInsightsOverviewLayout({ children }: { children: ReactNode }) {
  // The overview already inherits the OfficeShell page gutters from the
  // ui-redesign office layout. Reuse only the shared SEO canvas/surface
  // styling here so it aligns with child workspaces without double padding.
  return <div className={styles.canvas}>{children}</div>;
}
