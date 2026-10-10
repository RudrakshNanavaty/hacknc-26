import styles from "./BaselineBars.module.css";

/** Fixed order and fixed colors: flat, ridge, recess, yours. */
export function BaselineBars({
  flat,
  ridge,
  recess,
  yours,
}: {
  flat: number | null;
  ridge: number | null;
  recess: number | null;
  yours: number | null;
}) {
  const rows = [
    { key: "flat", label: "Flat", value: flat },
    { key: "ridge", label: "Ridge", value: ridge },
    { key: "recess", label: "Recess", value: recess },
    { key: "yours", label: "Yours", value: yours },
  ] as const;
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0)) * 1.1;
  return (
    <div className={styles.bars} role="table" aria-label="Simulated settlement compared with baselines">
      {rows.map((r) => (
        <div className={styles.row} role="row" key={r.key}>
          <span className={styles.label} role="rowheader">
            {r.label}
          </span>
          <span className={styles.track} role="cell">
            <span className={`${styles.fill} ${styles[r.key]}`} style={{ transform: `scaleX(${(r.value ?? 0) / max})` }} />
          </span>
          <span className={styles.value} role="cell">
            {r.value === null ? "—" : `${r.value.toFixed(1)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}
