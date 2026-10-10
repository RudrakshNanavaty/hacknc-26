import type { Tool } from "../../geometry";
import { Icon } from "../components/GlossIcon/icons";
import styles from "./ShapePalette.module.css";

const TOOLS: { tool: Tool; label: string; key: string; hint: string }[] = [
  { tool: "ridge", label: "Ridge", key: "1", hint: "1 mm raised rib. Click to place, drag up or down to set height" },
  { tool: "recess", label: "Recess", key: "2", hint: "2.5 mm cavity. Click to place, drag down to set depth" },
  { tool: "step", label: "Step", key: "3", hint: "8.5 mm plateau" },
  { tool: "flat", label: "Flatten", key: "4", hint: "Erase features back to flat" },
];

/** Left tool rail: shape tools, then history controls next to the canvas they affect. */
export function ShapePalette({
  selected,
  onSelect,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  selected: Tool;
  onSelect(t: Tool): void;
  onUndo(): void;
  onRedo(): void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  return (
    <nav className={styles.rail} aria-label="Building tools">
      <div className={styles.group} role="radiogroup" aria-label="Shape tools">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            role="radio"
            aria-checked={selected === t.tool}
            className={`${styles.tool} ${selected === t.tool ? styles.selected : ""}`}
            onClick={() => onSelect(t.tool)}
            title={`${t.label} (${t.key}): ${t.hint}`}
          >
            <Icon name={t.tool} size={22} />
            <span className={styles.label}>{t.label}</span>
          </button>
        ))}
      </div>
      <hr className={styles.sep} />
      <div className={styles.group}>
        <button className={styles.tool} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Icon name="undo" size={18} />
        </button>
        <button className={styles.tool} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
          <Icon name="redo" size={18} />
        </button>
      </div>
    </nav>
  );
}
