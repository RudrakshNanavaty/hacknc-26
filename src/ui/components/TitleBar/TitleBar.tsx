import { Icon } from "../GlossIcon/icons";
import styles from "./TitleBar.module.css";

export function TitleBar({ title, onCollapse, collapsed }: { title: string; onCollapse?: () => void; collapsed?: boolean }) {
  return (
    <header className={styles.bar}>
      <span className={styles.title}>{title}</span>
      {onCollapse && (
        <button
          className={styles.collapse}
          onClick={onCollapse}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          aria-expanded={!collapsed}
        >
          <Icon name={collapsed ? "chevronLeft" : "chevronRight"} size={16} />
        </button>
      )}
    </header>
  );
}
