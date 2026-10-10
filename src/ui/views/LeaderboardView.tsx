import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "../../contracts";
import { appConfig, baselines } from "../../experiment/benchmark";
import {
  deleteEntry,
  eligibility,
  LEADERBOARD_SEEDS,
  listEntries,
  NAME_MAX,
  paramsKey,
  rank,
  saveEntry,
  SURFACE_BUDGET_MM,
  toEntry,
  type LeaderboardEntry,
} from "../../experiment/leaderboard";
import { evaluateSeeds } from "../../sim/client";
import { AquaButton } from "../components/AquaButton/AquaButton";
import { GhostButton } from "../components/GhostButton/GhostButton";
import styles from "./LeaderboardView.module.css";

const NAME_KEY = "reefforge.playerName";

type Phase = { kind: "idle" } | { kind: "running"; done: number } | { kind: "error"; message: string };

function verdict(e: LeaderboardEntry, baseline: number | undefined) {
  if (baseline === undefined) return null;
  if (e.ciLo > baseline) return "beats";
  if (e.ciHi < baseline) return "below";
  return "tied";
}

/** "Beat the Recess": local leaderboard. Evaluates on fixed seeds in a separate worker. */
export function LeaderboardView({ profile, onLoad }: { profile: Profile; onLoad(p: Profile): void }) {
  const config = useMemo(() => appConfig(LEADERBOARD_SEEDS[0]!), []);
  const key = paramsKey(config);
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const elig = eligibility(profile);

  const refresh = () => listEntries().then((l) => setEntries(rank(l, key)), () => setEntries([]));
  useEffect(() => {
    refresh();
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!elig.ok) return;
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({ kind: "running", done: 0 });
    try {
      const configs = LEADERBOARD_SEEDS.map((s) => appConfig(s));
      const records = await evaluateSeeds(profile, configs, (done) => setPhase({ kind: "running", done }), ctrl.signal);
      const entry = toEntry(name, profile, records, config);
      await saveEntry(entry);
      setJustAdded(entry.id);
      setPhase({ kind: "idle" });
      refresh();
    } catch (e) {
      setPhase(ctrl.signal.aborted ? { kind: "idle" } : { kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const running = phase.kind === "running";

  return (
    <div className={styles.view}>
      <div className={styles.targets}>
        <span className={`${styles.target} ${styles.recess}`}>Beat the recess · {baselines ? `${baselines.recess.toFixed(1)}%` : "—"}</span>
        <span className={`${styles.target} ${styles.ridge}`}>Then the ridge · {baselines ? `${baselines.ridge.toFixed(1)}%` : "—"}</span>
      </div>

      <section className={styles.submit}>
        <div className={styles.budget}>
          <span>Surface used</span>
          <span className={styles.meter} aria-hidden="true">
            <span
              className={`${styles.meterFill} ${elig.exposedLengthMm > SURFACE_BUDGET_MM ? styles.over : ""}`}
              style={{ transform: `scaleX(${Math.min(1, elig.exposedLengthMm / SURFACE_BUDGET_MM)})` }}
            />
          </span>
          <span className={styles.num}>
            {elig.exposedLengthMm.toFixed(1)} / {SURFACE_BUDGET_MM} mm
          </span>
        </div>
        {!elig.ok && <p className={styles.reason}>{elig.reason}</p>}
        <div className={styles.form}>
          <label className={styles.name}>
            <span>Name</span>
            <input
              value={name}
              maxLength={NAME_MAX}
              placeholder="Anonymous reef"
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setName(e.target.value)}
              disabled={running}
            />
          </label>
          {running ? (
            <GhostButton onClick={() => abort.current?.abort()}>Cancel</GhostButton>
          ) : (
            <AquaButton onClick={submit} disabled={!elig.ok}>
              Evaluate &amp; submit
            </AquaButton>
          )}
        </div>
        <p className={styles.status} aria-live="polite">
          {running
            ? `Evaluating on seed ${Math.min(phase.done + 1, LEADERBOARD_SEEDS.length)} of ${LEADERBOARD_SEEDS.length}…`
            : phase.kind === "error"
              ? `Could not evaluate: ${phase.message}`
              : `Your current design runs on ${LEADERBOARD_SEEDS.length} fixed seeds with the frozen parameters.`}
        </p>
      </section>

      {entries === null ? (
        <p className={styles.muted}>Loading…</p>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>No entries yet. Build a design within the {SURFACE_BUDGET_MM} mm surface budget, then submit it.</p>
      ) : (
        <ol className={styles.list}>
          {entries.map((e, i) => {
            const vsRecess = verdict(e, baselines?.recess);
            const vsRidge = verdict(e, baselines?.ridge);
            return (
              <li key={e.id} className={`${styles.row} ${e.id === justAdded ? styles.fresh : ""}`}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.who} title={e.name}>
                  {e.name}
                  <span className={styles.muted}>{new Date(e.createdAt).toLocaleDateString()}</span>
                </span>
                <span className={styles.score}>
                  {e.meanPct.toFixed(1)}%
                  <span className={styles.muted}>
                    [{e.ciLo.toFixed(1)}, {e.ciHi.toFixed(1)}]
                  </span>
                </span>
                <span className={styles.chips}>
                  {vsRidge === "beats" ? (
                    <span className={`${styles.chip} ${styles.win}`}>beats ridge</span>
                  ) : vsRecess === "beats" ? (
                    <span className={`${styles.chip} ${styles.win}`}>beats recess</span>
                  ) : vsRecess === "tied" ? (
                    <span className={styles.chip}>≈ recess</span>
                  ) : (
                    <span className={`${styles.chip} ${styles.lose}`}>below recess</span>
                  )}
                </span>
                <span className={styles.actions}>
                  <GhostButton size="sm" onClick={() => onLoad(e.profile)}>
                    Load
                  </GhostButton>
                  <GhostButton size="sm" icon="trash" aria-label={`Delete ${e.name}`} onClick={() => deleteEntry(e.id).then(refresh)} />
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className={styles.muted}>
        Stored in this browser only. "Beats" means the entry's 95% CI is entirely above that baseline. A high simulator score
        is a hypothesis to test, not a better real reef.
      </p>
    </div>
  );
}
