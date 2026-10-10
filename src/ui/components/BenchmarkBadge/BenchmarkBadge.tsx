import styles from "./BenchmarkBadge.module.css";

/** Clicking opens the assumptions list. */
export function BenchmarkBadge({
  status,
  ciText,
  onClick,
}: {
  status: "pass" | "fail" | "pending";
  ciText: string;
  onClick?: () => void;
}) {
  const text = status === "pending" ? "Benchmark: PENDING" : `Benchmark: ${status.toUpperCase()}`;
  return (
    <button className={`${styles.badge} ${styles[status]}`} onClick={onClick} title={ciText} aria-label={`${text}. ${ciText}. Show assumptions.`}>
      <span className={styles.dot} aria-hidden="true" />
      {text}
    </button>
  );
}
