// A persona as a soap bubble (lobby, landing, studio).
import { PERSONA_INFO, type PersonaId } from '@shared';
import { spriteSvg } from '../map/sprites';
import { usePortrait } from '../characters/portraits';

export function PersonaOrb({ persona, size = 44, dim = false }: { persona: PersonaId; size?: number; dim?: boolean }) {
  const p = PERSONA_INFO[persona];
  const portrait = usePortrait(persona);
  return (
    <span className="persona-orb overflow-hidden" style={{ width: size, height: size, fontSize: size * 0.5, ['--tint' as string]: p.color, opacity: dim ? 0.45 : 1 }} aria-hidden>
      {portrait ? <img src={portrait.face} alt="" draggable={false} className="h-full w-full object-cover" /> : p.emoji}
    </span>
  );
}

/** A persona's face (the map avatar's head, cropped) in a bubble: the same character the map shows. */
export function FaceOrb({ persona, size = 44 }: { persona: PersonaId; size?: number }) {
  const portrait = usePortrait(persona);
  const style = { width: size, height: size, ['--tint' as string]: PERSONA_INFO[persona].color };
  // The 3D character's face when its portrait is ready; the drawn sprite's head until then.
  if (portrait) {
    return (
      <span className="face-orb" style={style} role="img" aria-label={PERSONA_INFO[persona].name}>
        <img src={portrait.face} alt="" draggable={false} />
      </span>
    );
  }
  const html = spriteSvg(persona).replace('viewBox="0 0 80 100"', 'viewBox="13 1 54 54"');
  return <span className="face-orb" style={style} role="img" aria-label={PERSONA_INFO[persona].name} dangerouslySetInnerHTML={{ __html: html }} />;
}
