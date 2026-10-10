import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "../GlossIcon/icons";
import styles from "./Modal.module.css";

/** Centered dialog over a scrim. Closes on Escape or scrim click. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea, a[href], summary, [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, []);
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
