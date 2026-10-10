import type { Profile } from "../../contracts";
import { PRESETS } from "../../geometry";
import { Icon, type IconName } from "../components/GlossIcon/icons";
import styles from "./views.module.css";

const ICON: Record<string, IconName> = {
  "preset-flat": "flat",
  "preset-ridge": "ridge",
  "preset-recess": "recess",
  "preset-step": "step",
};

export function PresetPicker({ current, onPick }: { current: string; onPick(p: Profile): void }) {
  return (
    <div className={styles.presets}>
      {PRESETS.map((p) => (
        <button key={p.id} className={`${styles.preset} ${current === p.id ? styles.presetOn : ""}`} onClick={() => onPick(p)}>
          <Icon name={ICON[p.id] ?? "flat"} size={22} />
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );
}
