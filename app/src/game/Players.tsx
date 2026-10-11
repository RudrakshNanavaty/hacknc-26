// A persona as a soap bubble (lobby, landing, studio).
import { PERSONA_INFO, type PersonaId } from '@shared';
import { spriteSvg } from '../map/sprites';

export function PersonaOrb({ persona, size = 44, dim = false }: { persona: PersonaId; size?: number; dim?: boolean }) {
  const p = PERSONA_INFO[persona];
  return (
    <span className="persona-orb" style={{ width: size, height: size, fontSize: size * 0.5, ['--tint' as string]: p.color, opacity: dim ? 0.45 : 1 }} aria-hidden>
      {p.emoji}
    </span>
  );
}

/** A persona's face (the map avatar's head, cropped) in a bubble: the same character the map shows. */
export function FaceOrb({ persona, size = 44 }: { persona: PersonaId; size?: number }) {
  const html = spriteSvg(persona).replace('viewBox="0 0 80 100"', 'viewBox="13 1 54 54"');
  return (
    <span
      className="face-orb" style={{ width: size, height: size, ['--tint' as string]: PERSONA_INFO[persona].color }}
      role="img" aria-label={PERSONA_INFO[persona].name} dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
