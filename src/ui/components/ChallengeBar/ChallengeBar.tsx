import type { ReactNode } from "react";
import { BenchmarkBadge } from "../BenchmarkBadge/BenchmarkBadge";
import styles from "./ChallengeBar.module.css";

export function ChallengeBar({
  title,
  conditions,
  benchmarkStatus,
  ciText,
  onBadgeClick,
  children,
}: {
  title: string;
  conditions: string;
  benchmarkStatus: "pass" | "fail" | "pending";
  ciText: string;
  onBadgeClick(): void;
  children?: ReactNode;
}) {
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden="true" />
        <span className={styles.name}>ReefForge</span>
      </div>
      <div className={styles.challenge}>
        <span className={styles.title}>{title}</span>
        <span className={styles.conditions}>{conditions}</span>
      </div>
      <div className={styles.right}>
        {children}
        <BenchmarkBadge status={benchmarkStatus} ciText={ciText} onClick={onBadgeClick} />
      </div>
    </header>
  );
}
