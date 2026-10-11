// Stakeholder figurines as inline SVG: glossy collectible figures on a persona-colored base (Mayor blue, Activist
// pink, Resort Owner gold, Resident green, Fisherman teal), chibi proportions, one silhouette prop per role so they
// read at a glance on a busy map. Original artwork. Faces carry every mouth and brow variant; CSS shows the one that
// matches the avatar's mood (data-mood in styles.css). Gradient ids are per role (each role stands on the map once).
import { PERSONA_INFO, type RoleId } from '@shared';

interface Look {
  skin: string;
  outfit: string;
  /** Darker shade of the outfit: shading and outline. */
  shade: string;
  /** Lighter shade: the gloss highlight. */
  light: string;
  /** The base's color. */
  base: string;
  /** Drawn behind the body (signs, umbrellas, rods). */
  back?: string;
  /** Drawn on the body (sashes, badges, prints). */
  chest?: string;
  /** Hair or hat, drawn over the head. */
  top: string;
  /** Over the eyes (sunglasses). */
  eyes?: string;
  /** Under the mouth (beards). */
  chin?: string;
}

const TEAL = '#14b8a6';

/** Mix two #rrggbb colors (t = share of b). SVG attributes do not take color-mix() everywhere. */
function mix(a: string, b: string, t: number): string {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = n(a);
  const y = n(b);
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const LOOKS: Record<RoleId, Look> = {
  mayor: {
    skin: '#f2c39b', outfit: '#2f6fd8', shade: '#1b3f8c', light: '#8fbaff', base: PERSONA_INFO.mayor.color,
    // A gold chain of office and a little red tie.
    chest: '<path d="M22 49 Q32 60 42 49" stroke="#ffd23f" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="32" cy="58" r="3.4" fill="#ffd23f" stroke="#b88a00" stroke-width="1"/><path d="M30.5 47 L33.5 47 L33 53 L31 53Z" fill="#e0334a"/>',
    top: '<path d="M14 28 C12 12 24 4 34 5 C46 5 54 13 51 27 C49 19 44 15 36 16 C28 13 20 17 14 28Z" fill="#c9ced8"/><path d="M20 12 C28 2 44 2 48 11 C40 8 30 8 20 12Z" fill="#eef0f4"/>',
  },
  activist: {
    skin: '#c98d5f', outfit: '#ff5fa2', shade: '#b8306c', light: '#ffb3d3', base: PERSONA_INFO.activist.color,
    // A protest sign on a pole and a leaf badge.
    back: '<rect x="50" y="10" width="3" height="52" rx="1.5" fill="#8a5a2b"/><rect x="39" y="1" width="26" height="17" rx="4" fill="#fffbe6" stroke="#b8306c" stroke-width="2"/><path d="M44 12 q3 -6 7 -2 q3 -5 8 1" stroke="#2f8a52" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
    chest: '<path d="M27 51 q5 -7 10 0 q-5 4 -10 0Z" fill="#3cc85a" stroke="#1f7a35" stroke-width="1"/><path d="M32 49 v6" stroke="#1f7a35" stroke-width="1"/>',
    top: '<path d="M13 27 C12 11 23 5 32 5 C42 5 51 11 51 27 C48 20 40 16 32 17 C24 16 16 20 13 27Z" fill="#3a2418"/><path d="M48 18 Q58 30 52 44" stroke="#3a2418" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="20" cy="12" r="3.5" fill="#ffe066"/>',
  },
  resort: {
    skin: '#f5d0a9', outfit: '#f5b400', shade: '#a87a00', light: '#ffe58a', base: PERSONA_INFO.resort.color,
    // A Panama hat, sunglasses and a flower print.
    chest: '<circle cx="24" cy="55" r="2.4" fill="#ff5c8a"/><circle cx="38" cy="60" r="2.4" fill="#19b6e6"/><circle cx="30" cy="66" r="2.2" fill="#ff5c8a"/><circle cx="42" cy="51" r="2" fill="#fff"/>',
    top: '<ellipse cx="32" cy="16" rx="25" ry="5" fill="#f4ecd2" stroke="#cbbd8e" stroke-width="1"/><path d="M19 16 C19 4 45 4 45 16 Z" fill="#f4ecd2" stroke="#cbbd8e" stroke-width="1"/><rect x="19" y="12" width="26" height="4" fill="#3a3a3a"/>',
    eyes: '<rect x="20" y="25" width="10" height="7" rx="3" fill="#1b1b1b"/><rect x="34" y="25" width="10" height="7" rx="3" fill="#1b1b1b"/><rect x="29" y="27" width="6" height="2" fill="#1b1b1b"/><rect x="22" y="26" width="3" height="2" rx="1" fill="#fff" opacity=".75"/><rect x="36" y="26" width="3" height="2" rx="1" fill="#fff" opacity=".75"/>',
  },
  resident: {
    skin: '#8d5a3b', outfit: '#3cc85a', shade: '#1f7a35', light: '#a6f0b5', base: PERSONA_INFO.resident.color,
    // An umbrella for the rain that floods West Avenue, and rain boots.
    back: '<path d="M6 22 Q30 -8 60 18 Z" fill="#ffd23f" stroke="#c99a00" stroke-width="1.5"/><path d="M6 22 Q14 15 21 21 Q29 14 36 20 Q44 13 51 19 Q56 15 60 18" fill="none" stroke="#c99a00" stroke-width="1.5"/><rect x="53" y="18" width="2.4" height="42" fill="#555"/>',
    chest: '<rect x="30.5" y="47" width="3" height="21" fill="#1f7a35"/><circle cx="27" cy="53" r="1.3" fill="#fff"/><circle cx="27" cy="61" r="1.3" fill="#fff"/>',
    top: '<circle cx="18" cy="20" r="7" fill="#2b1a10"/><circle cx="26" cy="13" r="8" fill="#2b1a10"/><circle cx="37" cy="12" r="8" fill="#2b1a10"/><circle cx="46" cy="19" r="7" fill="#2b1a10"/>',
  },
  fisherman: {
    skin: '#e0ac7e', outfit: '#0f9488', shade: '#0b5f58', light: '#7fe6d9', base: TEAL,
    // A rod with a line, a bucket hat and a grey beard.
    back: '<path d="M10 72 L58 2" stroke="#6b4a2a" stroke-width="2.4" stroke-linecap="round"/><path d="M58 2 Q63 20 60 34" stroke="#eaeaea" stroke-width="1" fill="none"/><path d="M57 34 l6 0 l-3 5z M60 34 q-5 2 0 5" fill="#9ad0e8"/>',
    chest: '<rect x="23" y="47" width="18" height="10" rx="2" fill="#fff"/><rect x="25" y="47" width="3" height="12" fill="#0b5f58"/><rect x="36" y="47" width="3" height="12" fill="#0b5f58"/>',
    top: '<path d="M12 22 L16 10 Q32 2 48 10 L52 22 Z" fill="#c8b37a"/><rect x="10" y="19" width="44" height="5" rx="2.5" fill="#b29c62"/>',
    chin: '<path d="M20 34 Q32 50 44 34 Q40 42 32 43 Q24 42 20 34Z" fill="#9aa0a6"/>',
  },
};

/** The figurine's SVG (64 x 92 viewBox: the figure stands on its base). */
export function spriteSvg(role: RoleId): string {
  const l = LOOKS[role];
  const id = `cc-${role}`;
  return `<svg class="avatar-svg" viewBox="0 0 64 92" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l.light}"/><stop offset=".35" stop-color="${l.outfit}"/><stop offset="1" stop-color="${l.shade}"/></linearGradient>
    <radialGradient id="${id}-head" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="${l.skin}"/><stop offset="1" stop-color="${l.skin}"/></radialGradient>
    <linearGradient id="${id}-base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="${l.base}"/><stop offset="1" stop-color="${mix(l.base, '#0a2a40', 0.45)}"/></linearGradient>
  </defs>
  <g class="av-base">
    <ellipse cx="32" cy="84" rx="25" ry="7" fill="${l.base}" opacity=".35"/>
    <path d="M7 79 L7 83 A25 7 0 0 0 57 83 L57 79 Z" fill="${l.base}" stroke="${mix(l.base, '#062a40', 0.4)}" stroke-width="1"/>
    <ellipse cx="32" cy="79" rx="25" ry="7" fill="url(#${id}-base)" stroke="#fff" stroke-width="1.2"/>
    <path d="M14 77 Q32 72 50 77" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85"/>
  </g>
  <g class="av-figure">
    <g class="av-back">${l.back ?? ''}</g>
    <g class="av-legs"><rect x="23" y="66" width="7" height="11" rx="3" fill="${l.shade}"/><rect x="34" y="66" width="7" height="11" rx="3" fill="${l.shade}"/>
      <ellipse cx="26" cy="78" rx="5" ry="2.6" fill="#2a2a2a"/><ellipse cx="38" cy="78" rx="5" ry="2.6" fill="#2a2a2a"/></g>
    <g class="av-body">
      <path d="M16 72 C14 54 20 44 32 44 C44 44 50 54 48 72 Z" fill="url(#${id}-body)" stroke="${l.shade}" stroke-width="1.6"/>
      <path d="M20 54 C21 49 25 46 30 46" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>
      ${l.chest ?? ''}
      <circle class="av-hand av-hand-l" cx="16" cy="62" r="4" fill="${l.skin}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
      <circle class="av-hand av-hand-r" cx="48" cy="62" r="4" fill="${l.skin}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
    </g>
    <g class="av-head">
      <circle cx="32" cy="28" r="18" fill="url(#${id}-head)" stroke="rgba(60,30,10,.25)" stroke-width="1.2"/>
      <ellipse cx="22" cy="34" rx="3.4" ry="2.2" fill="#ff8f8f" opacity=".45"/><ellipse cx="42" cy="34" rx="3.4" ry="2.2" fill="#ff8f8f" opacity=".45"/>
      <g class="av-eyes"><ellipse cx="25" cy="28" rx="3.2" ry="3.8" fill="#fff"/><ellipse cx="39" cy="28" rx="3.2" ry="3.8" fill="#fff"/>
        <circle class="av-pupil" cx="25.5" cy="28.5" r="2" fill="#1b1b1b"/><circle class="av-pupil" cx="39.5" cy="28.5" r="2" fill="#1b1b1b"/>
        <circle cx="26.3" cy="27.6" r=".7" fill="#fff"/><circle cx="40.3" cy="27.6" r=".7" fill="#fff"/></g>
      ${l.eyes ?? ''}
      <g class="av-brows-calm"><path d="M21 22 q4 -2 8 0" stroke="#3a2a1f" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M35 22 q4 -2 8 0" stroke="#3a2a1f" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
      <g class="av-brows-angry"><path d="M21 20 L29 23" stroke="#3a2a1f" stroke-width="2" stroke-linecap="round"/><path d="M43 20 L35 23" stroke="#3a2a1f" stroke-width="2" stroke-linecap="round"/></g>
      <g class="av-brows-worried"><path d="M21 23 L29 20" stroke="#3a2a1f" stroke-width="1.8" stroke-linecap="round"/><path d="M43 23 L35 20" stroke="#3a2a1f" stroke-width="1.8" stroke-linecap="round"/></g>
      ${l.chin ?? ''}
      <path class="av-mouth av-mouth-smile" d="M26 36 Q32 41 38 36" stroke="#5a2a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path class="av-mouth av-mouth-grin" d="M25 35 Q32 44 39 35 Z" fill="#5a2a1a"/>
      <path class="av-mouth av-mouth-frown" d="M26 39 Q32 34 38 39" stroke="#5a2a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path class="av-mouth av-mouth-wobble" d="M25 38 q2 -2 4 0 t4 0 t4 0" stroke="#5a2a1a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path class="av-mouth av-mouth-smirk" d="M27 37 Q34 39 39 34" stroke="#5a2a1a" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${l.top}
      <ellipse cx="24" cy="16" rx="6" ry="3" fill="#fff" opacity=".28" transform="rotate(-25 24 16)"/>
    </g>
  </g>
</svg>`;
}

/** The base color of a role's figurine (for bubbles and name tags). */
export const roleColor = (role: RoleId): string => LOOKS[role].base;
