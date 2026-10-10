import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "../GlossIcon/icons";
import styles from "./Modal.module.css";

/** Centered dialog over a scrim. Closes on Escape or scrim click. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`${styles.dialog} ${wide ? styles.wide : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className={styles.bar}>
          <span className={styles.title}>{title}</span>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
