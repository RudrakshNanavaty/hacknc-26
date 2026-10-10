import { Icon, type IconName } from "./icons";
import styles from "./GlossIcon.module.css";

export type GlossTone = "aqua" | "leaf" | "coral" | "sun" | "ink";

/** A glossy rounded tile around an icon. */
export function GlossIcon({ icon, tone = "aqua", size = 20 }: { icon: IconName; tone?: GlossTone; size?: number }) {
  return (
    <span className={`${styles.tile} ${styles[tone]}`}>
      <Icon name={icon} size={size} />
    </span>
  );
}
