// A small pill: provenance of a number, or a status. Same words as the old ProvenanceTag.
import type { ReactNode } from 'react';
import type { Provenance } from '@shared';
import { cx } from './cx';

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  measured: 'Measured',
  published: 'Published',
  model: 'Ocean model',
  'game-defined': 'Game-defined',
};

const PROVENANCE_TONE: Record<Provenance, TagTone> = {
  measured: 'seagrass',
  published: 'aqua',
  model: 'lagoon',
  'game-defined': 'sun',
};

export type TagTone = 'neutral' | 'seagrass' | 'aqua' | 'lagoon' | 'sun' | 'coral';

export function Tag({
  tone = 'neutral',
  provenance,
  className,
  children,
}: {
  tone?: TagTone;
  /** Shortcut for a provenance label: sets the words and the colour. */
  provenance?: Provenance;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={cx('tag', className)} data-tone={provenance ? PROVENANCE_TONE[provenance] : tone}>
      {provenance ? PROVENANCE_LABEL[provenance] : children}
    </span>
  );
}
