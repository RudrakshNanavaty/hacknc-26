// Stakeholder avatars as inline SVG: chibi proportions (big head, small body) in a sticker outline,
// one silhouette prop per role so they read at a glance on a busy map. Faces carry every mouth and
// brow variant; CSS shows the one that matches the avatar's mood (data-mood in styles.css).
// The news anchor shares the rig (presentation only: it is not a role in the game).
import type { RoleId } from '@shared';

export type SpriteRole = RoleId | 'anchor';

interface Look {
  skin: string;
  skinLight: string;
  skinShade: string;
  /** Outfit base and highlight (a diagonal gradient), and the darker trim used for legs. */
  fit: string;
  fitLight: string;
  trim: string;
  shoes?: string;
  /** Eyebrow color (hair color, unless the look says otherwise). */
  brow?: string;
  /** Drawn behind the body (signs, umbrellas, rods). */
  back?: string;
  /** Drawn behind the head (pigtails, hair puffs). */
  hairBack?: string;
  /** Drawn on the torso (sashes, lapels, prints). */
  chest?: string;
  /** Hair or hat, drawn over the head. */
  top: string;
  /** Over the eyes (glasses). */
  eyes?: string;
  /** Under the mouth (beards). */
  chin?: string;
  /** Over the mouth (moustaches). */
  face?: string;
  /** Worn over everything on the head side (headset). */
  gear?: string;
}

const O = '#1a2f4a';
const ST = `stroke="${O}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const THIN = `stroke="${O}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"`;

const LOOKS: Record<SpriteRole, Look> = {
  mayor: {
    skin: '#f0bd93', skinLight: '#fbd9b8', skinShade: '#d89a72',
    fit: '#2c4796', fitLight: '#5878cf', trim: '#1d2c63', brow: '#8b909a',
    chest:
      `<path d="M31 52.5 L40 68 L49 52.5 Z" fill="#fff" ${THIN}/>` +
      `<path d="M27 54 L40 71 L33 53 Z" fill="#1f3377" ${THIN}/><path d="M53 54 L40 71 L47 53 Z" fill="#1f3377" ${THIN}/>` +
      `<path d="M38 55 L42 55 L43 70 L40 74 L37 70 Z" fill="#d6334a" ${THIN}/><path d="M37.2 52.8 L42.8 52.8 L42 57 L38 57Z" fill="#b82640" ${THIN}/>` +
      `<path d="M24 57 L30 52.6 L61 77 L60 82 L52 82 Z" fill="#d6334a" opacity=".94" ${THIN}/>` +
      `<circle cx="49" cy="70" r="4.2" fill="#ffd23f" stroke="#a87800" stroke-width="1.3"/><circle cx="49" cy="70" r="1.7" fill="#fff3b0"/>`,
    top:
      `<path d="M19.5 31 C17 13 29 5.5 41.5 6 C54 6 63 14 60.5 31 C58.5 22 52 17.5 44 18.5 C36 16.5 26 19.5 19.5 31Z" fill="#d6dae2" ${ST}/>` +
      `<path d="M24 15.5 C32 6.5 51 6.5 57 14.5 C48 11.5 36 11.5 24 15.5Z" fill="#f2f4f8" stroke="none"/>` +
      `<path d="M31 11 q4 -2.5 9 -2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".9"/>`,
    eyes:
      `<circle cx="32" cy="33.5" r="6.6" fill="rgba(255,255,255,.18)" stroke="#8a6a2a" stroke-width="1.7"/>` +
      `<circle cx="48" cy="33.5" r="6.6" fill="rgba(255,255,255,.18)" stroke="#8a6a2a" stroke-width="1.7"/>` +
      `<path d="M38.4 33 q1.6 -1.8 3.2 0" stroke="#8a6a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    face: `<path d="M30.5 40.5 Q35.5 37.5 40 40.5 Q44.5 37.5 49.5 40.5 Q45.5 46 40 43.2 Q34.5 46 30.5 40.5Z" fill="#c9ced6" ${THIN}/>`,
  },
  activist: {
    skin: '#c98d5f', skinLight: '#e2ab80', skinShade: '#a56d44',
    fit: '#4fb819', fitLight: '#8fe24d', trim: '#2f7a0f', brow: '#2a1a12',
    back:
      '<rect x="62.5" y="22" width="3.2" height="46" rx="1.6" fill="#8a5a2b" stroke="#1a2f4a" stroke-width="1.2"/>' +
      `<rect x="50" y="3" width="28" height="20" rx="3.5" fill="#fffbe6" ${ST}/>` +
      '<path d="M57 14 q3.5 -5 7 0 t7 0" stroke="#2f8a52" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M60 9 q4 -3 9 -1" stroke="#2f8a52" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    hairBack:
      `<circle cx="15" cy="42" r="6.2" fill="#2a1a12" ${ST}/><circle cx="65" cy="42" r="6.2" fill="#2a1a12" ${ST}/>` +
      '<rect x="11.5" y="34.5" width="7" height="3.6" rx="1.8" fill="#ffd23f"/><rect x="61.5" y="34.5" width="7" height="3.6" rx="1.8" fill="#ffd23f"/>',
    chest:
      '<path d="M25 53.5 Q40 63 55 53.5 L55 59.5 Q40 69 25 59.5Z" fill="#fff4c2" ' + THIN + '/>' +
      '<path d="M25 57 Q40 66.5 55 57" stroke="#4fb819" stroke-width="2" fill="none"/>' +
      '<path d="M44 64 q6 -2 8 4 q-5 2 -8 -4Z" fill="#2f8a52" ' + THIN + '/>',
    top:
      `<path d="M19.5 29 C18 11 30 5.5 40.5 6 C52 6 62 11 60.5 29 C56 21 49 17 40 17.5 C31 17 24 21 19.5 29Z" fill="#2a1a12" ${ST}/>` +
      `<path d="M20 25.5 C30 18 50 18 60 25.5 L59.5 30 C50 23.5 30 23.5 20.5 30Z" fill="#2f8a52" ${ST}/>` +
      `<path d="M55 22 q8 -9 14 -2 q-6 6 -14 2Z" fill="#6fd16a" ${THIN}/><path d="M56 22.5 q6 -4 11 -2" stroke="#2f8a52" stroke-width="1" fill="none"/>`,
  },
  resort: {
    skin: '#f5d0a9', skinLight: '#ffe6cc', skinShade: '#e2a97e',
    fit: '#ffab14', fitLight: '#ffd35c', trim: '#c97a00', brow: '#5a3a1a',
    chest:
      '<circle cx="28" cy="62" r="3" fill="#ff5c8a"/><circle cx="52" cy="66" r="3" fill="#19b6e6"/><circle cx="35" cy="74" r="2.8" fill="#ff5c8a"/>' +
      '<circle cx="47" cy="58" r="2.4" fill="#fff"/><circle cx="55" cy="76" r="2.4" fill="#fff"/><circle cx="26" cy="73" r="2.2" fill="#19b6e6"/>' +
      '<path d="M26 54 Q40 70 54 54" stroke="#ff5c8a" stroke-width="4.4" fill="none" stroke-dasharray="0.1 5.4" stroke-linecap="round"/>' +
      '<path d="M27.5 55 Q40 71 52.5 55" stroke="#fff" stroke-width="3" fill="none" stroke-dasharray="0.1 8" stroke-linecap="round" stroke-dashoffset="3"/>',
    top:
      `<path d="M19.5 28 C18 20 24 17.5 40 17.5 C56 17.5 62 20 60.5 28 C55 22.5 25 22.5 19.5 28Z" fill="#6b4a1f" ${THIN}/>` +
      `<path d="M26 18 C26 3 54 3 54 18Z" fill="#f6eed4" ${ST}/>` +
      '<rect x="26" y="11.5" width="28" height="5.5" fill="#d6334a" stroke="#1a2f4a" stroke-width="1.2"/>' +
      `<ellipse cx="40" cy="18" rx="27.5" ry="6" fill="#f6eed4" ${ST}/>` +
      '<path d="M18 17 Q40 24 62 17" stroke="#d8cba0" stroke-width="1.4" fill="none"/>' +
      '<path d="M26 18 C26 3 54 3 54 18" fill="none"/>',
    eyes:
      `<rect x="24.5" y="28.5" width="14" height="10" rx="4.5" fill="#15171c" ${THIN}/><rect x="41.5" y="28.5" width="14" height="10" rx="4.5" fill="#15171c" ${THIN}/>` +
      '<rect x="38" y="31" width="4" height="2.4" fill="#15171c"/>' +
      '<rect x="27" y="30.5" width="4.4" height="2" rx="1" fill="#fff" opacity=".75"/><rect x="44" y="30.5" width="4.4" height="2" rx="1" fill="#fff" opacity=".75"/>',
  },
  resident: {
    skin: '#8d5a3b', skinLight: '#aa7350', skinShade: '#6c4129',
    fit: '#ff6f5e', fitLight: '#ff9d8f', trim: '#c9423a', shoes: '#ffd23f', brow: '#1c100a',
    back:
      `<path d="M0 25 Q34 -22 78 22 Z" fill="#19b6e6" ${ST}/>` +
      '<path d="M0 25 Q8 17 16 24 Q25 14 34 22 Q43 12 52 21 Q61 13 69 21 Q74 17 78 22" fill="none" stroke="#0f8fb8" stroke-width="1.6"/>' +
      '<path d="M39 -1 L39 -5" stroke="#555" stroke-width="2" stroke-linecap="round"/>' +
      '<rect x="55" y="20" width="2.6" height="40" rx="1.3" fill="#555"/>',
    hairBack:
      `<circle cx="22" cy="19" r="8" fill="#241309" ${ST}/><circle cx="58" cy="19" r="8" fill="#241309" ${ST}/>`,
    chest:
      '<path d="M40 53 V82" stroke="#c9423a" stroke-width="2"/><rect x="39" y="54" width="2" height="4.4" rx="1" fill="#ffd23f"/>' +
      '<path d="M26 66 h9 v8 h-9z" fill="none" stroke="#c9423a" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<circle cx="29" cy="58" r="1.4" fill="#fff"/><circle cx="52" cy="62" r="1.4" fill="#fff"/>',
    top:
      `<circle cx="24" cy="15" r="8" fill="#241309" ${ST}/><circle cx="33" cy="9" r="8.4" fill="#241309" ${ST}/>` +
      `<circle cx="45" cy="9" r="8.4" fill="#241309" ${ST}/><circle cx="55" cy="15" r="8" fill="#241309" ${ST}/>` +
      '<path d="M22 24 C28 15 52 15 58 24 C52 20 28 20 22 24Z" fill="#241309"/>' +
      '<path d="M30 8 q4 -2.5 8 -1" stroke="#5a3a26" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/>',
  },
  fisherman: {
    skin: '#e0ac7e', skinLight: '#f4c8a0', skinShade: '#bf8a5d',
    fit: '#2f7fb8', fitLight: '#5fa8dc', trim: '#1f5f8f', shoes: '#4a3a2a', brow: '#8e949c',
    back:
      '<path d="M6 92 L66 4" stroke="#6b4a2a" stroke-width="2.8" stroke-linecap="round"/>' +
      '<path d="M66 4 Q74 22 70 38" stroke="#dfe3e8" stroke-width="1.2" fill="none"/>' +
      '<path d="M67 38 l7 0 l-3.5 5z" fill="#9ad0e8" stroke="#1a2f4a" stroke-width="1"/>',
    chest:
      '<path d="M25 53.5 L36 53.5 L33.5 82 L21 82Z" fill="#f2a900" opacity=".95" ' + THIN + '/>' +
      '<path d="M55 53.5 L44 53.5 L46.5 82 L59 82Z" fill="#f2a900" opacity=".95" ' + THIN + '/>' +
      '<rect x="26" y="66" width="7" height="6" rx="1.4" fill="#d18b00" ' + THIN + '/><rect x="47" y="66" width="7" height="6" rx="1.4" fill="#d18b00" ' + THIN + '/>' +
      '<path d="M36 53 L40 58 L44 53Z" fill="#fff" ' + THIN + '/>',
    top:
      `<path d="M16.5 25 L21 11 Q40 3 59 11 L63.5 25 Z" fill="#cdb87c" ${ST}/>` +
      `<rect x="13" y="22" width="54" height="6.5" rx="3.2" fill="#b49e62" ${ST}/>` +
      '<path d="M21 17 Q40 12 59 17" stroke="#8a7640" stroke-width="1.6" fill="none"/>' +
      '<circle cx="53" cy="16" r="2.4" fill="#d6334a" stroke="#1a2f4a" stroke-width="1"/>',
    chin: `<path d="M21.5 37 Q40 64 58.5 37 Q53 50.5 40 51 Q27 50.5 21.5 37Z" fill="#a9afb7" ${THIN}/>`,
  },
  anchor: {
    skin: '#e9b78c', skinLight: '#f8d3b0', skinShade: '#c9916a',
    fit: '#0fa0b4', fitLight: '#51d0dc', trim: '#0b6e7c', brow: '#3a2418',
    chest:
      '<path d="M30 52.8 L40 66 L50 52.8 Z" fill="#fff" ' + THIN + '/>' +
      '<path d="M27 54 L40 70 L33 53 Z" fill="#0b8a9c" ' + THIN + '/><path d="M53 54 L40 70 L47 53 Z" fill="#0b8a9c" ' + THIN + '/>' +
      '<rect x="46" y="62" width="6" height="3.6" rx="1.2" fill="#ffd23f" ' + THIN + '/>',
    top:
      `<path d="M19.5 31 C17 13 29 5.5 41.5 6 C54 6 63 14 60.5 31 C58 23 52 17 43 18.2 C35 17 24 19.5 19.5 31Z" fill="#3a2418" ${ST}/>` +
      '<path d="M26 12 C34 6 48 6 55 12" stroke="#7a5236" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>',
    gear:
      '<path d="M19.5 29 C19 8 61 8 60.5 29" stroke="#23262e" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="18.5" cy="35" r="4.4" fill="#2d313b" ' + THIN + '/>' +
      '<path d="M18.5 39 Q20 50 31 47" stroke="#23262e" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="32" cy="47" r="2.6" fill="#ff5c4d" ' + THIN + '/>',
  },
};

/** The avatar's SVG (80 x 100 viewBox). */
export function spriteSvg(role: SpriteRole): string {
  const l = LOOKS[role];
  const id = `av-${role}`;
  const brow = l.brow ?? '#3a2a1f';
  const arm = (d: string) => `<path d="${d}" fill="none" stroke="${O}" stroke-width="11.4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${l.fit}" stroke-width="7.6" stroke-linecap="round"/>`;
  return `<svg class="avatar-svg" viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="${id}-skin" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="${l.skinLight}"/><stop offset=".55" stop-color="${l.skin}"/><stop offset="1" stop-color="${l.skinShade}"/></radialGradient>
    <linearGradient id="${id}-fit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l.fitLight}"/><stop offset="1" stop-color="${l.fit}"/></linearGradient>
  </defs>
  <g class="av-back">${l.back ?? ''}</g>
  <g class="av-legs">
    <rect x="28" y="78" width="9.5" height="12" rx="4.2" fill="${l.trim}" ${ST}/><rect x="42.5" y="78" width="9.5" height="12" rx="4.2" fill="${l.trim}" ${ST}/>
    <ellipse cx="31" cy="91.4" rx="7.4" ry="3.7" fill="${l.shoes ?? '#2b2f3a'}" ${ST}/><ellipse cx="49" cy="91.4" rx="7.4" ry="3.7" fill="${l.shoes ?? '#2b2f3a'}" ${ST}/>
    <ellipse cx="29" cy="90.2" rx="3" ry="1.1" fill="#fff" opacity=".35"/><ellipse cx="47" cy="90.2" rx="3" ry="1.1" fill="#fff" opacity=".35"/>
  </g>
  <g class="av-body">
    ${arm('M25 58 C16.5 62 13.5 70 15 76')}${arm('M55 58 C63.5 62 66.5 70 65 76')}
    <path d="M19 82.5 C17 63 24 52 40 52 C56 52 63 63 61 82.5 Z" fill="url(#${id}-fit)" ${ST}/>
    <path d="M24 60 C25 56 29 54 33 53.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".35"/>
    ${l.chest ?? ''}
    <circle class="av-hand av-hand-l" cx="14.5" cy="77.5" r="5" fill="url(#${id}-skin)" ${ST}/>
    <circle class="av-hand av-hand-r" cx="65.5" cy="77.5" r="5" fill="url(#${id}-skin)" ${ST}/>
  </g>
  <g class="av-head">
    ${l.hairBack ?? ''}
    <circle cx="20.2" cy="34.5" r="4" fill="url(#${id}-skin)" ${ST}/><circle cx="59.8" cy="34.5" r="4" fill="url(#${id}-skin)" ${ST}/>
    <ellipse cx="40" cy="32" rx="20.6" ry="19.8" fill="url(#${id}-skin)" ${ST}/>
    <ellipse cx="27" cy="41.5" rx="4.2" ry="2.7" fill="#ff6f6f" opacity=".32"/><ellipse cx="53" cy="41.5" rx="4.2" ry="2.7" fill="#ff6f6f" opacity=".32"/>
    <path d="M38.8 37.2 q2.4 1.8 .4 3.8" stroke="${l.skinShade}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    ${l.chin ?? ''}
    <g class="av-eyes">
      <ellipse cx="32" cy="33.5" rx="4.6" ry="5.4" fill="#fff" stroke="${O}" stroke-width="1.3"/><ellipse cx="48" cy="33.5" rx="4.6" ry="5.4" fill="#fff" stroke="${O}" stroke-width="1.3"/>
      <circle class="av-pupil" cx="32.6" cy="34.4" r="3" fill="#1b1b1b"/><circle class="av-pupil" cx="48.6" cy="34.4" r="3" fill="#1b1b1b"/>
      <circle cx="33.8" cy="32.6" r="1.2" fill="#fff"/><circle cx="49.8" cy="32.6" r="1.2" fill="#fff"/>
    </g>
    ${l.eyes ?? ''}
    <g class="av-brows-calm"><path d="M26.5 26 q5.5 -3 11 0" stroke="${brow}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M42.5 26 q5.5 -3 11 0" stroke="${brow}" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>
    <g class="av-brows-angry"><path d="M26 23.5 L37.5 27.5" stroke="${brow}" stroke-width="2.8" stroke-linecap="round"/><path d="M54 23.5 L42.5 27.5" stroke="${brow}" stroke-width="2.8" stroke-linecap="round"/></g>
    <g class="av-brows-worried"><path d="M26 27.5 L37.5 24" stroke="${brow}" stroke-width="2.6" stroke-linecap="round"/><path d="M54 27.5 L42.5 24" stroke="${brow}" stroke-width="2.6" stroke-linecap="round"/></g>
    <path class="av-mouth av-mouth-smile" d="M34 45 Q40 50.5 46 45" stroke="#5a1d12" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <g class="av-mouth av-mouth-grin"><path d="M32.5 43.5 Q40 55 47.5 43.5 Z" fill="#5a1d12" stroke="#5a1d12" stroke-width="1.4" stroke-linejoin="round"/><path d="M36 49.4 Q40 53.2 44 49.4 Q40 47.2 36 49.4Z" fill="#ff7a8a"/></g>
    <path class="av-mouth av-mouth-frown" d="M34 48.5 Q40 42.5 46 48.5" stroke="#5a1d12" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path class="av-mouth av-mouth-wobble" d="M32.5 46.5 q2.5 -2.6 5 0 t5 0 t5 0" stroke="#5a1d12" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path class="av-mouth av-mouth-smirk" d="M34.5 45.5 Q41.5 48.5 47.5 42.5" stroke="#5a1d12" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse class="av-mouth av-mouth-talk" cx="40" cy="46" rx="4.4" ry="3.2" fill="#5a1d12"/>
    ${l.face ?? ''}
    ${l.top}
    ${l.gear ?? ''}
  </g>
</svg>`;
}
