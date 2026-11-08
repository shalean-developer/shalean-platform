import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { ShaleanNavLogo } from "@/components/brand/ShaleanNavLogo";
import styles from "./email-ui.module.css";

export function EmailHeader({ title, description, backHref = "/office/marketing/email", backLabel = "Email campaigns" }: {
  title: string; description: string; backHref?: string; backLabel?: string;
}) {
  return <header className={styles.hero}>
    <div className={styles.heroTop}>
      <Link className={styles.back} href={backHref}><ArrowLeft size={15} aria-hidden="true" />{backLabel}</Link>
      <Link className={styles.brand} href="/" aria-label="Shalean home"><ShaleanNavLogo className={styles.logo} /></Link>
    </div>
    <p className={styles.eyebrow}><Mail size={14} aria-hidden="true" /> Shalean email</p>
    <h1>{title}</h1><p className={styles.description}>{description}</p>
  </header>;
}

export function EmailNavigation() {
  return <nav className={styles.navigation} aria-label="Email workspace">
      <Link href="/office/marketing/email">Campaign drafts</Link>
      <Link href="/office/templates">Templates</Link>
      <Link href="/office/lifecycle-emails">Lifecycle</Link>
      <Link href="/office/email-operations">Delivery</Link>
      <Link href="/office/email-operations/timeline">Timeline</Link>
      <Link href="/office/email-operations/retry">Recovery</Link>
      <Link href="/office/email-operations/health">Health</Link>
      <Link href="/office/email-operations/campaigns">Analytics</Link>
    </nav>;
}

export function EmailWorkspace({ children, title, description, backHref, backLabel, navigation = true }: {
  children: ReactNode; title: string; description: string; backHref?: string; backLabel?: string; navigation?: boolean;
}) {
  return <div className={`${styles.theme} ${styles.workspace}`}>
    <EmailHeader title={title} description={description} backHref={backHref} backLabel={backLabel} />
    {navigation && <EmailNavigation />}
    {children}
  </div>;
}
