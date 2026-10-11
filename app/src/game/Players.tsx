// A persona as a soap bubble (lobby, landing, studio).
import { PERSONA_INFO, type PersonaId } from '@shared';

export function PersonaOrb({ persona, size = 44, dim = false }: { persona: PersonaId; size?: number; dim?: boolean }) {
  const p = PERSONA_INFO[persona];
  return (
    <span className="persona-orb" style={{ width: size, height: size, fontSize: size * 0.5, ['--tint' as string]: p.color, opacity: dim ? 0.45 : 1 }} aria-hidden>
      {p.emoji}
    </span>
  );
}
