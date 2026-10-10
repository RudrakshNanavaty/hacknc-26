// A bottom sheet with two detents (peek and open) for phones. The peek area is always on screen;
// the body slides up under the thumb. It tracks the pointer 1:1, projects where a flick would come
// to rest, and springs there at the release velocity, so it can be grabbed again mid-flight.
import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const DECELERATION = 0.998;
/** Where a gesture released at `v` px/s would coast to, the way scroll deceleration does. */
const project = (v: number) => ((v / 1000) * DECELERATION) / (1 - DECELERATION);

export interface SheetProps {
  /** Always visible: title and the primary actions. */
  peek: ReactNode;
  /** Revealed when the sheet is open. */
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Height of the always-visible part in px, so the map can keep its subject clear of the sheet. */
  onPeekHeight?: (px: number) => void;
  label: string;
}

export function Sheet({ peek, children, open, onOpenChange, onPeekHeight, label }: SheetProps) {
  const y = useMotionValue(0);
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const peekRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<number | null>(null);
  const settledTo = useRef<number | null>(null);

  // How far the body is tucked below the screen at rest, and how tall the peek is.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const peekEl = peekRef.current;
    if (!body || !peekEl) return;
    const measure = () => {
      setHidden(body.offsetHeight);
      onPeekHeight?.(peekEl.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    ro.observe(peekEl);
    return () => ro.disconnect();
  }, [onPeekHeight]);

  // Follow `open` (the handle, the keyboard); a finished drag has already moved there itself.
  useLayoutEffect(() => {
    if (hidden === null) return;
    const target = open ? 0 : hidden;
    if (settledTo.current === target) return;
    const first = settledTo.current === null;
    settledTo.current = target;
    if (first || reduce) y.set(target);
    else animate(y, target, { type: 'spring', duration: 0.4, bounce: 0 });
  }, [open, hidden, reduce, y]);

  // A closed sheet's body is off screen: keep it out of the tab order too.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.inert = !open;
  }, [open]);

  const release = (velocity: number) => {
    if (hidden === null) return;
    const rest = y.get() + project(velocity);
    const goOpen = rest < hidden / 2;
    const target = goOpen ? 0 : hidden;
    settledTo.current = target;
    if (reduce) y.set(target);
    else animate(y, target, { type: 'spring', duration: 0.4, bounce: 0.2, velocity });
    onOpenChange(goOpen);
  };

  return (
    <motion.div
      role="region"
      aria-label={label}
      className="glass-deep fixed inset-x-0 bottom-0 z-20 rounded-b-none rounded-t-[28px] pb-[env(safe-area-inset-bottom)]"
      style={{ y, opacity: hidden === null ? 0 : 1 }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={{ top: 0, bottom: hidden ?? 0 }}
      dragElastic={0.12}
      onDragEnd={(_, info) => release(info.velocity.y)}
    >
      <div ref={peekRef} className="touch-none px-4 pt-1 pb-3" onPointerDown={(e) => controls.start(e)}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Hide reef details' : 'Show reef details'}
          className="mx-auto flex h-6 w-16 items-center justify-center"
          onClick={() => onOpenChange(!open)}
        >
          <span className="h-1.5 w-10 rounded-full bg-white/60" />
        </button>
        {peek}
      </div>
      <div ref={bodyRef} className="max-h-[50dvh] overflow-y-auto px-4 pb-4">
        {children}
      </div>
    </motion.div>
  );
}
