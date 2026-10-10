import { useEffect, useRef, useState } from "react";
import { critique, criticAvailable, type CriticResult } from "../../../ai/critic";
import type { ExperimentRecord } from "../../../contracts";
import { BENCHMARK, baselines } from "../../../experiment/benchmark";
import { GhostButton } from "../GhostButton/GhostButton";
import styles from "./CriticCard.module.css";

const SECTIONS: { key: keyof CriticResult["critique"]; title: string }[] = [
  { key: "why", title: "Why this score" },
  { key: "flowFeatures", title: "Flow features that likely mattered" },
  { key: "limits", title: "What limits this conclusion" },
  { key: "tryNext", title: "What to try next" },
];

type State = { kind: "idle" } | { kind: "loading" } | { kind: "done"; result: CriticResult } | { kind: "error"; message: string };

/** Gemini explains the current record. Hidden when no key is configured; never affects a score. */
export function CriticCard({ record }: { record: ExperimentRecord | null }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  // A new record invalidates the previous explanation.
  useEffect(() => {
    abort.current?.abort();
    setState({ kind: "idle" });
  }, [record]);

  if (!criticAvailable) return null;

  const run = async () => {
    if (!record) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ kind: "loading" });
    try {
      const result = await critique(
        record,
        {
          baselines,
          status: BENCHMARK?.status ?? null,
          recessMinusRidge: BENCHMARK ? BENCHMARK.recessMinusRidge : null,
        },
        ctrl.signal,
      );
      if (!ctrl.signal.aborted) setState({ kind: "done", result });
    } catch (e) {
      if (!ctrl.signal.aborted) setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className={styles.card} aria-live="polite">
      <div className={styles.head}>
        <span className={styles.label}>AI explanation</span>
        {state.kind === "done" && <span className={styles.model}>{state.result.model}</span>}
      </div>

      {state.kind === "idle" && (
        <GhostButton size="sm" icon="help" onClick={run} disabled={!record}>
          Explain this result
        </GhostButton>
      )}

      {state.kind === "loading" && (
        <div className={styles.skeleton} aria-label="Asking Gemini">
          <i />
          <i />
          <i />
        </div>
      )}

      {state.kind === "error" && (
        <div className={styles.error}>
          <p>{state.message}</p>
          <GhostButton size="sm" onClick={run}>
            Try again
          </GhostButton>
        </div>
      )}

      {state.kind === "done" && (
        <>
          {SECTIONS.map((s) => (
            <section key={s.key} className={styles.section}>
              <h4>{s.title}</h4>
              <p>{state.result.critique[s.key]}</p>
            </section>
          ))}
          {state.result.ungroundedNumbers.length > 0 && (
            <p className={styles.warn}>
              Mentions numbers not in the record ({state.result.ungroundedNumbers.join(", ")}). Treat those as unverified.
            </p>
          )}
        </>
      )}

      <p className={styles.note}>Written by Gemini from the experiment record. Scores come from the simulator, never from the AI.</p>
    </div>
  );
}
