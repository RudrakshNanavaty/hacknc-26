import type { ReactNode } from 'react';
import { PERSONA_INFO, type PersonaId } from '@shared';
import { PersonaOrb } from '../game/Players';

/** Shared identity layout in selection cards, lobby seats, and the landing roster. */
export function Stakeholder({ persona, children, dim = false }: { persona: PersonaId; children: ReactNode; dim?: boolean }) {
  return <span className="stakeholder-identity">
    <PersonaOrb persona={persona} size={48} dim={dim} />
    <span className="stakeholder-copy">
      <span className="stakeholder-name">{PERSONA_INFO[persona].name}</span>
      <span className="stakeholder-detail">{children}</span>
    </span>
  </span>;
}
