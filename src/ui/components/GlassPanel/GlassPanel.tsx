import type { ReactNode } from "react";
import { TitleBar } from "../TitleBar/TitleBar";
import styles from "./GlassPanel.module.css";

/** The only component allowed to use backdrop-filter. */
export function GlassPanel({
  title,
  variant = "default",
  onCollapse,
  collapsed,
  className = "",
  children,
}: {
  title?: string;
  variant?: "default" | "strong";
  onCollapse?: () => void;
  collapsed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${styles.panel} ${styles[variant]} ${className}`} aria-label={title}>
      {title && <TitleBar title={title} onCollapse={onCollapse} collapsed={collapsed} />}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
