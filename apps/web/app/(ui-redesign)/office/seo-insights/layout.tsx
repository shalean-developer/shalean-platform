import type { ReactNode } from "react";
import styles from "../../../office/seo-insights/seo-command-centre.module.css";

export default function SeoInsightsOverviewLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.canvas}>{children}</div>
    </div>
  );
}
