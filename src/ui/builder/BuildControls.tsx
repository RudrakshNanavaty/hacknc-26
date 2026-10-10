import { applyTool, preset } from "../../geometry";
import { BUILD_LIMITS, MATERIAL_LIMIT, materialUsed, reliefArea, RELIEF_AREA_LIMIT } from "../../experiment/missions";
import { useApp } from "../../state/store";
import { GhostButton } from "../components/GhostButton/GhostButton";
import { ShapePalette } from "./ShapePalette";
import styles from "../layout/AppShell.module.css";
import { useState } from "react";

export function BuildControls() {
  const s = useApp();
  const p = s.history.present;
  const [column, setColumn] = useState(34);
  const used = materialUsed(p);
  const selected = p.segments.find(seg => s.selectedColumn !== null && seg.x <= s.selectedColumn && seg.x + seg.width > s.selectedColumn);
  const place = () => s.setProfile({ ...applyTool(p, BUILD_LIMITS, s.tool, column, { width: s.toolWidth, height: s.toolHeight }), id: "player", name: "Your design" });
  const remove = () => {
    if (selected) s.setProfile(applyTool(p, BUILD_LIMITS, "flat", selected.x + selected.width / 2, { width: selected.width }));
  };
  return <div className={styles.builder}>
    <ShapePalette selected={s.tool} onSelect={s.setTool} onUndo={s.undo} onRedo={s.redo} canUndo={s.history.past.length > 0} canRedo={s.history.future.length > 0} />
    <div className={styles.dimensions}>
      <label>Width <select aria-label="Feature width" value={s.toolWidth} onChange={e => s.set({ toolWidth: Number(e.target.value) })}>
        {[2,4,8,10,16,24,34].map(v => <option key={v} value={v}>{v * 0.25} mm</option>)}
      </select></label>
      <label>{s.tool === "recess" ? "Depth" : "Height"} <select aria-label="Feature height" disabled={s.tool === "flat"} value={Math.abs(s.toolHeight)} onChange={e => s.set({ toolHeight: Number(e.target.value) * (s.tool === "recess" ? -1 : 1) })}>
        {(s.tool === "flat" ? [0] : [2,4,6,8,10]).map(v => <option key={v} value={v}>{v * 0.25} mm</option>)}
      </select></label>
      <label>At <input aria-label="Placement position in mm" type="number" min={0} max={33.75} step={0.25} value={column * 0.25} onChange={e => setColumn(Math.max(0, Math.min(135, Math.round(Number(e.target.value) * 4))))} /></label>
      <GhostButton size="sm" onClick={place}>Place</GhostButton>
      <label className={styles.selection}>Select <select aria-label="Select geometry" value={selected?.id ?? ""} onChange={e => { const seg = p.segments.find(x => x.id === e.target.value); s.set({ selectedColumn: seg ? seg.x : null }); }}>
        <option value="">Shift-click a feature</option>
        {p.segments.filter(seg => seg.height !== 0).map(seg => <option key={seg.id} value={seg.id}>{seg.kind} at {seg.x * 0.25} mm</option>)}
      </select></label>
      <GhostButton size="sm" icon="trash" disabled={!selected || selected.height === 0} onClick={remove} aria-label="Delete selected feature" />
      <GhostButton size="sm" icon="reset" onClick={() => s.setProfile(preset("flat"))}>Reset</GhostButton>
    </div>
    <div className={styles.budget} title="Surface fabrication proxy: 34 mm bed plus all vertical walls, including recess walls. Flattening refunds material.">
      <span>Material <strong data-testid="material">{used.toFixed(1)} / {MATERIAL_LIMIT} mm</strong></span>
      <meter min={34} max={MATERIAL_LIMIT} value={used} aria-label="Material used" />
      <small>{(MATERIAL_LIMIT - used).toFixed(1)} mm available · area {reliefArea(p).toFixed(1)} / {RELIEF_AREA_LIMIT} mm²</small>
    </div>
  </div>;
}
