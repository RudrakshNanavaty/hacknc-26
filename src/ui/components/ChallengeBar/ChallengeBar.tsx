import { BenchmarkBadge } from "../BenchmarkBadge/BenchmarkBadge";
import styles from "./ChallengeBar.module.css";

/** Top region: who we are, what the challenge is, and the benchmark status. Nothing else. */
export function ChallengeBar({
  title,
  benchmarkStatus,
  ciText,
  onBadgeClick,
}: {
  title: string;
  benchmarkStatus: "pass" | "fail" | "pending";
  ciText: string;
  onBadgeClick(): void;
}) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true" />
        <span className={styles.name}>ReefForge</span>
      </div>
      <span className={styles.divider} aria-hidden="true" />
      <h1 className={styles.title}>{title}</h1>
      <BenchmarkBadge status={benchmarkStatus} ciText={ciText} onClick={onBadgeClick} />
    </header>
  );
}
