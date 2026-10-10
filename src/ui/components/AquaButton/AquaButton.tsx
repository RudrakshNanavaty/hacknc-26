import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./AquaButton.module.css";

/** Primary actions only: Run, Save. */
export function AquaButton({
  size = "md",
  loading = false,
  children,
  className = "",
  ...rest
}: { size?: "md" | "lg"; loading?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${styles.button} ${styles[size]} ${className}`} aria-busy={loading} {...rest}>
      <span className={styles.label}>{children}</span>
    </button>
  );
}
