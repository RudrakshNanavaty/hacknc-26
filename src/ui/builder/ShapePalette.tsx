import type { Tool } from "../../geometry";
import { Icon } from "../components/GlossIcon/icons";
import styles from "./ShapePalette.module.css";

const TOOLS: { tool: Tool; label: string; key: string; hint: string }[] = [
  { tool: "ridge", label: "Ridge", key: "1", hint: "1 mm wide raised rib; drag up/down to set height" },
  { tool: "recess", label: "Recess", key: "2", hint: "2.5 mm wide cavity; drag down to set depth" },
  { tool: "step", label: "Step", key: "3", hint: "8.5 mm wide plateau" },
  { tool: "flat", label: "Flatten", key: "4", hint: "Erase features back to flat" },
];

export function ShapePalette({ selected, onSelect }: { selected: Tool; onSelect(t: Tool): void }) {
  return (
    <div className={styles.palette} role="radiogroup" aria-label="Shape tools">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          role="radio"
          aria-checked={selected === t.tool}
          className={`${styles.tool} ${selected === t.tool ? styles.selected : ""}`}
          onClick={() => onSelect(t.tool)}
          title={`${t.label} (${t.key}): ${t.hint}`}
        >
          <Icon name={t.tool} size={26} />
          <span className={styles.label}>{t.label}</span>
          <kbd className={styles.key}>{t.key}</kbd>
        </button>
      ))}
    </div>
  );
}
