import { describe, expect, it } from 'vitest';
import corpus from '../../../pipeline/research/miami-beach-civic-corpus.json';
import { CARDS, HAND_SIZE, PERSONAS, handOf } from './content';
import { botPlay, checkPlay, dealtHand } from './engine';
import { crisisBubbles } from './living';
import { cardName, pickStories, playableStories, storyCrisis, validateCast, type CivicStory } from './story';

const stories = (corpus as { items: CivicStory[] }).items;
const cast = playableStories(stories);

describe('cast stories', () => {
  it('every stored cast still passes validation', () => {
    expect(cast.length).toBeGreaterThanOrEqual(12);
    for (const s of cast) {
      const v = validateCast(s.cast, s);
      expect(v.ok, `${s.id}: ${v.ok ? '' : v.reasons.join('; ')}`).toBe(true);
    }
  });

  it('casts only real sides as counterparts and deals each persona from their own deck', () => {
    for (const s of cast) {
      for (const p of PERSONAS) {
        expect(s.cast!.hands[p]).toHaveLength(HAND_SIZE);
        expect(s.cast!.hands[p].every((c) => handOf(p).includes(c))).toBe(true);
      }
      for (const role of Object.values(s.cast!.roles)) {
        if (role.counterpart) expect(s.sides.some((x) => x.who.toLowerCase().includes(role.counterpart!.toLowerCase()) || role.counterpart!.toLowerCase().includes(x.who.toLowerCase()))).toBe(true);
      }
    }
  });

  it('rejects a cast that invents a counterpart or a number', () => {
    const s = cast[0]!;
    const bad = structuredClone(s.cast!) as unknown as { roles: Record<string, { counterpart: string; line: string }> };
    bad.roles.mayor!.counterpart = 'Governor Somebody';
    bad.roles.resident!.line = 'We counted 9999 flooded cars this morning alone.';
    const v = validateCast(bad, s);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reasons.join(' ')).toMatch(/not one of the story's sides/);
      expect(v.reasons.join(' ')).toMatch(/numbers not in the facts/);
    }
  });
});

describe('a match from stories', () => {
  it('picks three different stories, spread over areas, the same for the same seed', () => {
    const a = pickStories(stories, 42);
    expect(a).toHaveLength(3);
    expect(new Set(a.map((s) => s.id)).size).toBe(3);
    expect(new Set(a.map((s) => s.cast!.district)).size).toBeGreaterThanOrEqual(2);
    expect(pickStories(stories, 42).map((s) => s.id)).toEqual(a.map((s) => s.id));
    expect(pickStories(stories.slice(0, 1), 1)).toEqual([]);
  });

  it('carries the sources and the reviewer report with the crisis, so players can verify it', () => {
    const s: CivicStory = { ...cast[0]!, verification: { status: 'resolved', notes: ['Budget differs between pages'], resolution: 'Stated as a range' }, retrieved_at: '2026-10-11' };
    const story = storyCrisis(1, s, []).story!;
    expect(story.sources.length).toBeGreaterThan(0);
    expect(story.sources.every((x) => /^https?:\/\//.test(x.url) && x.id.startsWith(s.id))).toBe(true);
    expect(story.verification).toEqual({ status: 'resolved', notes: ['Budget differs between pages'], resolution: 'Stated as a range' });
    expect(story.retrievedAt).toBe('2026-10-11');
  });

  it('deals the story hand: only those cards can be played, under their story names', () => {
    const s = cast.find((x) => x.id === 'fontainebleau-water-park') ?? cast[0]!;
    const crisis = storyCrisis(2, s, []);
    const hand = dealtHand('resort', 2, crisis);
    expect(hand).toEqual(s.cast!.hands.resort);
    const notDealt = handOf('resort').find((c) => !hand.includes(c))!;
    expect(checkPlay('resort', 8, notDealt, crisis.spotlight[0], 2, crisis)).toMatch(/not in your hand this round/);
    expect(cardName(hand[0]!, crisis)).toBe(s.cast!.skins[hand[0]!]!.name);
    expect(cardName(hand[0]!, null)).toBe(CARDS[hand[0]!].name);
    // Bots play from the story's deal.
    const bot = botPlay('mayor', 8, 2, crisis);
    if (bot) expect(crisis.hands!.mayor).toContain(bot.card);
  });

  it('scripts the crisis: every character opens with the story line', () => {
    const s = cast[0]!;
    const crisis = storyCrisis(1, s, []);
    const bubbles = crisisBubbles(crisis, [...PERSONAS]);
    for (const b of bubbles) expect(b.text).toBe(s.cast!.roles[b.speaker]!.line);
    expect(crisis.story!.sources.every((x) => x.id.startsWith(`${s.id}#`) && /^https?:\/\//.test(x.url))).toBe(true);
  });

  it('round 3 always ends with the storm test', () => {
    const crisis = storyCrisis(3, cast[1]!, []);
    expect(crisis.text).toMatch(/storm tests the city/);
  });
});
