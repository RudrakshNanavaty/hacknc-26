import { describe, expect, it } from 'vitest';
import { CRISES, PERSONAS, type CardId, type PersonaId } from './content';
import { isDistrictId } from './districts';
import { buildBoard, finalResult, resolveRound, startCity, type Play } from './engine';
import { BUBBLE_WORDS, REACTIONS, REACTION_MOOD, crisisBubbles, finalBubbles, isRoleId, resolutionBubbles, revealBubbles, wordCount, type Bubble } from './living';

const seat: Record<PersonaId, number> = { mayor: 0, activist: 1, resort: 2, resident: 3 };
const play = (persona: PersonaId, card: CardId, district: string): Play => ({ seat: seat[persona], persona, card, district });

function wellFormed(bs: Bubble[]) {
  const speakers = bs.map((b) => b.speaker);
  expect(new Set(speakers).size).toBe(speakers.length); // one bubble per speaker per moment
  for (const b of bs) {
    expect(isRoleId(b.speaker)).toBe(true);
    expect(REACTIONS).toContain(b.reaction);
    expect(b.source).toBe('template');
    const n = wordCount(b.text);
    expect(n, b.text).toBeGreaterThanOrEqual(BUBBLE_WORDS.min);
    expect(n, b.text).toBeLessThanOrEqual(BUBBLE_WORDS.max);
    if (b.district !== null) expect(isDistrictId(b.district)).toBe(true);
  }
}

describe('living city templates', () => {
  it('every reaction maps to an avatar animation', () => {
    for (const r of REACTIONS) expect(REACTION_MOOD[r]).toBeTruthy();
  });

  it('crisis bubbles: every stakeholder and the fisherman, short and well formed', () => {
    for (const c of CRISES) {
      const bs = crisisBubbles(c, [...PERSONAS]);
      expect(bs.map((b) => b.speaker).sort()).toEqual(['activist', 'fisherman', 'mayor', 'resident', 'resort']);
      wellFormed(bs);
    }
  });

  it('reveal and resolution bubbles follow the board, deterministically', () => {
    const plays = [
      play('resort', 'hotel-development', 'south-pointe'),
      play('activist', 'environmental-challenge', 'south-pointe'),
      play('mayor', 'fast-track', 'south-pointe'),
      play('resident', 'public-access-guarantee', 'south-pointe'),
    ];
    const board = buildBoard(2, plays);
    const reveal = revealBubbles(board);
    wellFormed(reveal);
    expect(reveal.find((b) => b.speaker === 'resort')!.reaction).toBe('worry'); // their hotel is opposed
    expect(reveal.find((b) => b.speaker === 'activist')!.reaction).toBe('protest');
    expect(revealBubbles(buildBoard(2, [...plays].reverse()))).toEqual(reveal);

    const r = resolveRound(board, [], startCity());
    const after = resolutionBubbles(r);
    wellFormed(after);
    expect(after.find((b) => b.speaker === 'resort')!.reaction).toBe('protest'); // blocked by R1
    const f = finalResult(startCity().indicators, r.city.indicators, [r], [...PERSONAS]);
    wellFormed(finalBubbles(f));
  });
});
