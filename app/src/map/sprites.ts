// Stakeholder avatars as inline SVG: chibi proportions (big head, small body), one silhouette prop
// per role so they read at a glance on a busy satellite map. Faces carry every mouth and brow
// variant; CSS shows the one that matches the avatar's mood (data-mood in styles.css).
import type { RoleId } from '@shared';

interface Look {
  skin: string;
  outfit: string;
  trim: string;
  /** Drawn behind the body (signs, umbrellas, rods). */
  back?: string;
  /** Drawn on the body (sashes, straps, prints). */
  chest?: string;
  /** Hair or hat, drawn over the head. */
  top: string;
  /** Over the eyes (sunglasses). */
  eyes?: string;
  /** Under the mouth (beards). */
  chin?: string;
}

const LOOKS: Record<RoleId, Look> = {
  mayor: {
    skin: '#f2c39b', outfit: '#2c3e7a', trim: '#1d2a57',
    chest: '<path d="M22 47 L44 70 L39 72 L19 50Z" fill="#d6334a"/><circle cx="34" cy="60" r="3.2" fill="#ffd23f" stroke="#b88a00" stroke-width="1"/><path d="M32 46 L36 46 L35 55 L33 55Z" fill="#d6334a"/>',
    top: '<path d="M14 28 C12 12 24 4 34 5 C46 5 54 13 51 27 C49 19 44 15 36 16 C28 13 20 17 14 28Z" fill="#cfd4dc"/><path d="M20 12 C28 2 44 2 48 11 C40 8 30 8 20 12Z" fill="#e8ebf0"/>',
  },
  activist: {
    skin: '#c98d5f', outfit: '#5cc21b', trim: '#3f8f12',
    back: '<rect x="50" y="10" width="3" height="50" rx="1.5" fill="#8a5a2b"/><rect x="40" y="2" width="24" height="16" rx="3" fill="#fffbe6" stroke="#3f8f12" stroke-width="2"/><path d="M44 10 q4 -4 8 0 t8 0" stroke="#3f8f12" stroke-width="2" fill="none"/>',
    chest: '<path d="M26 47 Q32 52 38 47" stroke="#3f8f12" stroke-width="2" fill="none"/>',
    top: '<path d="M14 25 C14 11 24 6 32 6 C42 6 50 12 50 25 Z" fill="#2f8a52"/><rect x="13" y="22" width="38" height="6" rx="3" fill="#24703f"/><circle cx="32" cy="5" r="4" fill="#ffe066"/>',
  },
  resort: {
    skin: '#f5d0a9', outfit: '#ffb020', trim: '#e08a00',
    chest: '<circle cx="24" cy="54" r="2.4" fill="#ff5c8a"/><circle cx="38" cy="60" r="2.4" fill="#19b6e6"/><circle cx="30" cy="66" r="2.2" fill="#ff5c8a"/><circle cx="42" cy="51" r="2" fill="#fff"/>',
    top: '<ellipse cx="32" cy="16" rx="25" ry="5" fill="#f4ecd2" stroke="#d8cba0" stroke-width="1"/><path d="M19 16 C19 4 45 4 45 16 Z" fill="#f4ecd2" stroke="#d8cba0" stroke-width="1"/><rect x="19" y="12" width="26" height="4" fill="#3a3a3a"/>',
    eyes: '<rect x="20" y="25" width="10" height="7" rx="3" fill="#1b1b1b"/><rect x="34" y="25" width="10" height="7" rx="3" fill="#1b1b1b"/><rect x="29" y="27" width="6" height="2" fill="#1b1b1b"/><rect x="22" y="26" width="3" height="2" rx="1" fill="#fff" opacity=".7"/>',
  },
  resident: {
    skin: '#8d5a3b', outfit: '#ff7a6b', trim: '#e0554a',
    back: '<path d="M8 22 Q30 -6 58 18 Z" fill="#19b6e6" stroke="#0f8fb8" stroke-width="1.5"/><path d="M8 22 Q15 16 22 21 Q29 15 36 20 Q44 14 51 19 Q55 16 58 18" fill="none" stroke="#0f8fb8" stroke-width="1.5"/><rect x="52" y="18" width="2.4" height="40" fill="#555"/>',
    chest: '<rect x="30.5" y="46" width="3" height="22" fill="#e0554a"/><circle cx="27" cy="52" r="1.3" fill="#fff"/><circle cx="27" cy="60" r="1.3" fill="#fff"/>',
    top: '<circle cx="18" cy="20" r="7" fill="#2b1a10"/><circle cx="26" cy="13" r="8" fill="#2b1a10"/><circle cx="37" cy="12" r="8" fill="#2b1a10"/><circle cx="46" cy="19" r="7" fill="#2b1a10"/>',
  },
  fisherman: {
    skin: '#e0ac7e', outfit: '#2f7fb8', trim: '#1f5f8f',
    back: '<path d="M10 70 L58 2" stroke="#6b4a2a" stroke-width="2.4" stroke-linecap="round"/><path d="M58 2 Q63 20 60 34" stroke="#eaeaea" stroke-width="1" fill="none"/><path d="M57 34 l6 0 l-3 5z M60 34 q-5 2 0 5" fill="#9ad0e8"/>',
    chest: '<rect x="23" y="46" width="18" height="10" rx="2" fill="#fff"/><rect x="25" y="46" width="3" height="12" fill="#1f5f8f"/><rect x="36" y="46" width="3" height="12" fill="#1f5f8f"/>',
    top: '<path d="M12 22 L16 10 Q32 2 48 10 L52 22 Z" fill="#c8b37a"/><rect x="10" y="19" width="44" height="5" rx="2.5" fill="#b29c62"/>',
    chin: '<path d="M20 34 Q32 50 44 34 Q40 42 32 43 Q24 42 20 34Z" fill="#9aa0a6"/>',
  },
};

/** The avatar's SVG (64 x 80 viewBox). */
export function spriteSvg(role: RoleId): string {
  const l = LOOKS[role];
  return `<svg class="avatar-svg" viewBox="0 0 64 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g class="av-back">${l.back ?? ''}</g>
  <g class="av-legs"><rect x="23" y="66" width="7" height="10" rx="3" fill="${l.trim}"/><rect x="34" y="66" width="7" height="10" rx="3" fill="${l.trim}"/>
    <ellipse cx="26" cy="77" rx="5" ry="2.6" fill="#333"/><ellipse cx="38" cy="77" rx="5" ry="2.6" fill="#333"/></g>
  <g class="av-body">
    <path d="M16 72 C14 54 20 44 32 44 C44 44 50 54 48 72 Z" fill="${l.outfit}" stroke="${l.trim}" stroke-width="1.5"/>
    ${l.chest ?? ''}
    <circle class="av-hand av-hand-l" cx="16" cy="62" r="4" fill="${l.skin}"/>
    <circle class="av-hand av-hand-r" cx="48" cy="62" r="4" fill="${l.skin}"/>
  </g>
  <g class="av-head">
    <circle cx="32" cy="28" r="18" fill="${l.skin}"/>
    <ellipse cx="22" cy="34" rx="3.4" ry="2.2" fill="#ff8f8f" opacity=".45"/><ellipse cx="42" cy="34" rx="3.4" ry="2.2" fill="#ff8f8f" opacity=".45"/>
    <g class="av-eyes"><ellipse cx="25" cy="28" rx="3.2" ry="3.8" fill="#fff"/><ellipse cx="39" cy="28" rx="3.2" ry="3.8" fill="#fff"/>
      <circle class="av-pupil" cx="25.5" cy="28.5" r="2" fill="#1b1b1b"/><circle class="av-pupil" cx="39.5" cy="28.5" r="2" fill="#1b1b1b"/></g>
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
  </g>
</svg>`;
}
