import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "../GlossIcon/icons";
import styles from "./GhostButton.module.css";

/** Every secondary action. */
export function GhostButton({
  size = "md",
  icon,
  active = false,
  children,
  className = "",
  ...rest
}: {
  size?: "sm" | "md";
  icon?: IconName;
  active?: boolean;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${styles.button} ${styles[size]} ${active ? styles.active : ""} ${className}`} aria-pressed={active || undefined} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}
