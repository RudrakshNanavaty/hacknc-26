// The Workshop HUD: a glass frame around the build stage. It owns the top bar (reef, timer,
// material meter), the palette and results slots, and the action button. The 3D builder only
// supplies `stage` and `palette`, and calls `onSubmit` through `action`; it never edits HUD CSS.
//
//   top:      title, timer, material meter
//   palette:  part buttons, undo/redo (a collapsed <details> on phones)
//   stage:    the canvas (or, until the builder exists, the reference-tile picker)
//   drawer:   latest results, compare with a reference tile (a bottom sheet on phones)
//   action:   Test it / Lock in my design
import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cx } from './cx';
import { GlassPanel } from './GlassPanel';
import { Meter } from './Meter';

const PHONE = '(max-width: 767px)';

function usePhone() {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

export interface WorkshopLayoutProps {
  title: string;
  /** Seconds left in a room round; omit in solo. Pulses in the last 30 seconds. */
  secondsLeft?: number | null;
  material: { used: number; budget: number };
  stage: ReactNode;
  palette: ReactNode;
  /** Latest results and comparison. Omit to hide the drawer. */
  drawer?: ReactNode;
  drawerTitle?: string;
  /** The primary action (a gel Button). */
  action: ReactNode;
  className?: string;
}

export function WorkshopLayout({
  title,
  secondsLeft,
  material,
  stage,
  palette,
  drawer,
  drawerTitle = 'Results',
  action,
  className,
}: WorkshopLayoutProps) {
  const phone = usePhone();
  // Open on desktop, closed (just its header) on phones.
  const [drawerOpen, setDrawerOpen] = useState<boolean | null>(null);
  const open = drawerOpen ?? !phone;
  const bodyId = useId();

  return (
    <section className={cx('hud', className)} data-drawer={drawer ? (open ? 'open' : 'closed') : 'none'}>
      <GlassPanel as="header" className="hud__top" padding="sm" radius="pill">
        <h2 className="t-title">{title}</h2>
        {secondsLeft != null && (
          <span className="hud__timer tabular t-title" data-urgent={secondsLeft <= 30}>
            {secondsLeft} s
          </span>
        )}
        <Meter label="Material" value={material.used} max={material.budget} unit="voxels" />
      </GlassPanel>

      {phone ? (
        <GlassPanel as="details" className="hud__palette" padding="sm">
          <summary className="t-heading cursor-pointer">Parts</summary>
          <div className="mt-2">{palette}</div>
        </GlassPanel>
      ) : (
        <GlassPanel as="div" className="hud__palette" padding="md">
          {palette}
        </GlassPanel>
      )}

      <div className="hud__stage glass" data-padding="none">
        {stage}
      </div>

      {drawer && (
        <GlassPanel as="aside" className="hud__drawer" padding="md" aria-label={drawerTitle}>
          <button
            type="button"
            className="t-heading flex w-full items-center justify-between"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setDrawerOpen(!open)}
          >
            {drawerTitle}
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          </button>
          <div id={bodyId} hidden={!open} className="mt-3">
            {drawer}
          </div>
        </GlassPanel>
      )}

      <div className="hud__action">{action}</div>
    </section>
  );
}
