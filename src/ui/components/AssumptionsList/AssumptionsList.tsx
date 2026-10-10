import styles from "./AssumptionsList.module.css";

export function AssumptionsList({ items }: { items: string[] }) {
  return (
    <ul className={styles.list}>
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}
