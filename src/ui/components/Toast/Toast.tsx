import { useEffect } from "react";
import { useApp } from "../../../state/store";
import styles from "./Toast.module.css";

/** Bottom-centre, auto-dismisses after 3 s. */
export function Toast() {
  const toast = useApp((s) => s.toast);
  const set = useApp((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => set({ toast: null }), 3000);
    return () => clearTimeout(t);
  }, [toast, set]);
  if (!toast) return null;
  return (
    <div className={`${styles.toast} ${styles[toast.tone]}`} role="status">
      {toast.text}
    </div>
  );
}
