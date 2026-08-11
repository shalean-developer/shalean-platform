import type { ReactNode } from "react";
import styles from "./seo-command-centre.module.css";

export default function SeoInsightsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.canvas}>{children}</div>
    </div>
  );
}
