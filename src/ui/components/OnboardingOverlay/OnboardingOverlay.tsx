import { AquaButton } from "../AquaButton/AquaButton";
import { GhostButton } from "../GhostButton/GhostButton";
import { Modal } from "../Modal/Modal";
import styles from "./OnboardingOverlay.module.css";

const STEPS = [
  {
    title: "What am I looking at?",
    body: (
      <>
        <p>
          A <b>2D slice through a 34 × 16 mm patch of seabed</b>. Waves slosh the water back and forth (blue arrows). Orange dots are
          simulated coral larvae swimming in that flow.
        </p>
        <p>Pick a shape on the left and click the seabed to add it. Drag up or down while placing to set its height.</p>
      </>
    ),
  },
  {
    title: "What does the score mean?",
    body: (
      <>
        <p>
          <b>Simulated settlement</b> is the % of released larvae that settled. A larva settles only when it reaches the surface
          somewhere the water is slow enough, and then only with a fixed probability. Touching the surface isn't enough.
        </p>
        <p>It is a toy model. It says nothing about whether corals would survive or grow.</p>
      </>
    ),
  },
  {
    title: "Why trust it?",
    body: (
      <>
        <p>
          We tuned only two parameters, on <b>flat vs. ridge</b>, against a published flume study. Then we <b>froze</b> them and
          pre-registered a prediction for a <b>held-out recess</b> before ever simulating it.
        </p>
        <p>The badge at the top shows whether that prediction held, with its 95% confidence interval. The bars on the right put your design next to all three.</p>
      </>
    ),
  },
];

export function OnboardingOverlay({ step, onStep, onClose }: { step: number; onStep(n: number): void; onClose(): void }) {
  const s = STEPS[step - 1];
  if (!s) return null;
  return (
    <Modal title={`${step} of ${STEPS.length} · ${s.title}`} onClose={onClose}>
      <div className={styles.body}>{s.body}</div>
      <div className={styles.actions}>
        <span className={styles.dots} aria-hidden="true">
          {STEPS.map((_, i) => (
            <i key={i} className={i === step - 1 ? styles.on : ""} />
          ))}
        </span>
        {step > 1 && <GhostButton onClick={() => onStep(step - 1)}>Back</GhostButton>}
        {step < STEPS.length ? (
          <AquaButton onClick={() => onStep(step + 1)}>Next</AquaButton>
        ) : (
          <AquaButton onClick={onClose}>Start building</AquaButton>
        )}
      </div>
    </Modal>
  );
}
