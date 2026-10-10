import type { ReactNode } from "react";
import { GlossIcon, type GlossTone } from "../GlossIcon/GlossIcon";
import type { IconName } from "../GlossIcon/icons";
import styles from "./Dock.module.css";

export interface DockItem {
  id: string;
  label: string;
  icon: IconName;
  tone?: GlossTone;
  onClick(): void;
  disabled?: boolean;
  shortcut?: string;
}

export function Dock({ items, primary }: { items: DockItem[]; primary?: ReactNode }) {
  return (
    <nav className={styles.dock} aria-label="Run controls">
      {primary && <div className={styles.primary}>{primary}</div>}
      {items.map((it) => (
        <button
          key={it.id}
          className={styles.item}
          onClick={it.onClick}
          disabled={it.disabled}
          title={it.shortcut ? `${it.label} (${it.shortcut})` : it.label}
        >
          <span className={styles.icon}>
            <GlossIcon icon={it.icon} tone={it.tone} />
          </span>
          <span className={styles.label}>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
