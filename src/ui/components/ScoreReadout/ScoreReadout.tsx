import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../state/store";
import styles from "./ScoreReadout.module.css";

const durSlowMs = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dur-slow")) || 0;

/** The largest number on screen. Counts up over --dur-slow (instant with reduced motion). */
export function ScoreReadout({
  pct,
  label = "Simulated settlement",
  delta,
  dimmed = false,
}: {
  pct: number | null;
  label?: string;
  delta?: { value: number; vs: string } | null;
  dimmed?: boolean;
}) {
  const reduced = useApp((s) => s.reducedMotion);
  const [shown, setShown] = useState(pct ?? 0);
  const from = useRef(pct ?? 0);

  useEffect(() => {
    if (pct === null) return;
    const duration = durSlowMs();
    if (reduced || duration === 0) {
      setShown(pct);
      from.current = pct;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - t) ** 3;
      setShown(a + (pct - a) * e);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = pct;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct, reduced]);

  return (
    <div className={`${styles.wrap} ${dimmed ? styles.dimmed : ""}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value} aria-live="polite">
        {pct === null ? "—" : shown.toFixed(1)}
        <span className={styles.unit}>%</span>
      </div>
      <div className={styles.caption}>of released larvae settled (simulated)</div>
      {delta && (
        <div className={`${styles.delta} ${delta.value >= 0 ? styles.up : styles.down}`}>
          {delta.value >= 0 ? "▲" : "▼"} {Math.abs(delta.value).toFixed(1)} pts vs {delta.vs}
        </div>
      )}
    </div>
  );
}
