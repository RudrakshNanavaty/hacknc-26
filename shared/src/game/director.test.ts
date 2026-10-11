// The Director's validators: Gemini proposes, these decide. Valid, malformed, out-of-range and
// unknown-target proposals for every schema.
import { describe, expect, it } from 'vitest';
import type { CardId, PersonaId } from './content';
import {
  EVENT_RULES, applyDirectorEvent, checkSpoken, combosInReach, explainEligibility, mergeDialogue, negotiationCandidates, numbersIn, strayNumbers,
  templateEventProposal, templateHints, validateComboSuggestion, validateDialogue, validateEventProposal, validateReaction, validateSuggestion,
} from './director';
import { buildBoard, checkPlay, startCity, type Play } from './engine';
import { isCardId, isComboId } from './content';
import { crisisBubbles } from './living';
import { authoredScenario } from './scenario';

const seat: Record<PersonaId, number> = { mayor: 0, activist: 1, resort: 2, resident: 3 };
const play = (persona: PersonaId, card: CardId, district: string): Play => ({ seat: seat[persona], persona, card, district });
const crisisCtx = { round: 2, phase: 'crisis', fired: [], count: 0 };
const speakers = ['mayor', 'activist', 'resort', 'resident', 'fisherman'] as const;

describe('event proposals', () => {
  const good = { type: 'investor-interest', district: 'collins-mid-beach', magnitude: 2, narrative: 'Investors tour Collins Avenue with clipboards.', tension: 'medium' };

  it('accepts a valid proposal and sizes it from the catalogue, not the model', () => {
    const v = validateEventProposal(good, crisisCtx, 'gemini');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value).toMatchObject({ type: 'investor-interest', district: 'collins-mid-beach', magnitude: 2, delta: { economy: 2, budget: 2 }, fictional: true, source: 'gemini' });
    expect(v.clamped).toEqual([]);
  });

  it('rejects malformed proposals', () => {
    expect(validateEventProposal(null, crisisCtx, 'gemini').ok).toBe(false);
    expect(validateEventProposal('a hurricane', crisisCtx, 'gemini').ok).toBe(false);
    expect(validateEventProposal({ ...good, magnitude: 'big' }, crisisCtx, 'gemini').ok).toBe(false);
    expect(validateEventProposal({ ...good, type: 'tsunami' }, crisisCtx, 'gemini')).toMatchObject({ ok: false, reasons: [expect.stringMatching(/unknown event type/)] });
  });

  it('rejects unknown places and places the real data rules out', () => {
    expect(validateEventProposal({ ...good, district: 'atlantis' }, crisisCtx, 'gemini')).toMatchObject({ ok: false, reasons: [expect.stringMatching(/unknown district/)] });
    // North Beach is 24% hotel/commercial: no investor rush there.
    expect(validateEventProposal({ ...good, district: 'north-beach-oceanside' }, crisisCtx, 'gemini')).toMatchObject({ ok: false, reasons: [expect.stringMatching(/24%.*needs 25%/)] });
    // An algae bloom needs the bay.
    expect(validateEventProposal({ ...good, type: 'algae-bloom', district: 'collins-mid-beach' }, crisisCtx, 'gemini').ok).toBe(false);
    expect(validateEventProposal({ ...good, type: 'algae-bloom', district: 'west-avenue' }, crisisCtx, 'gemini').ok).toBe(true);
  });

  it('clamps out-of-range magnitudes and replaces narratives with numbers', () => {
    const v = validateEventProposal({ ...good, magnitude: 9, narrative: 'Investors bring 900 million dollars!' }, crisisCtx, 'gemini');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.magnitude).toBe(EVENT_RULES.magnitude.max);
    expect(v.value.delta).toEqual({ economy: 3, budget: 3 });
    expect(v.value.narrative).not.toMatch(/\d/);
    expect(v.clamped.join(' ')).toMatch(/clamped to 3.*narrative replaced/);
  });

  it('enforces phase, round, once-per-type and per-match limits', () => {
    expect(validateEventProposal(good, { ...crisisCtx, phase: 'select' }, 'gemini').ok).toBe(false);
    expect(validateEventProposal(good, { ...crisisCtx, round: 1 }, 'gemini').ok).toBe(false);
    expect(validateEventProposal(good, { ...crisisCtx, fired: ['investor-interest'] }, 'gemini').ok).toBe(false);
    expect(validateEventProposal(good, { ...crisisCtx, count: EVENT_RULES.perMatch }, 'gemini').ok).toBe(false);
  });

  it('the fallback twist fits the crisis the match wrote, in its spotlight where the facts allow', () => {
    const erosion = templateEventProposal(2, [], { kind: 'erosion', spotlight: ['north-beach-oceanside'] })!;
    expect(erosion).toMatchObject({ type: 'beach-erosion', district: 'north-beach-oceanside' });
    // A bay-side spotlight cannot have beach erosion: the next fitting twist, still in the spotlight.
    const bay = templateEventProposal(3, [], { kind: 'erosion', spotlight: ['west-avenue'] })!;
    expect(bay).toMatchObject({ type: 'access-march', district: 'west-avenue' });
    expect(templateEventProposal(2, ['investor-interest', 'access-march'], { kind: 'development', spotlight: ['collins-mid-beach'] })!.type).not.toMatch(/investor-interest|access-march/);
    expect(templateEventProposal(1, [], { kind: 'flood', spotlight: ['west-avenue'] })).toBeNull(); // no twists in round 1
  });

  it('has a deterministic template fallback for every twist round, and applying is pure', () => {
    for (const r of EVENT_RULES.rounds) {
      const p = templateEventProposal(r, []);
      expect(p).not.toBeNull();
      expect(validateEventProposal(p, { ...crisisCtx, round: r }, 'template').ok).toBe(true);
      expect(templateEventProposal(r, [])).toEqual(p);
    }
    const v = validateEventProposal(good, crisisCtx, 'gemini');
    if (!v.ok) throw new Error('expected ok');
    const city = startCity();
    const a = applyDirectorEvent(city, v.value);
    expect(a.city.indicators.economy).toBe(city.indicators.economy + 2);
    expect(city.indicators.economy).toBe(startCity().indicators.economy); // input untouched
    expect(a.event.rule).toBe('D1');
    expect(a.event.text).toMatch(/fictional/);
  });
});

describe('the number and safety checks behind every AI text', () => {
  it('spelled-out quantities count as numbers; small rhetorical counts do not', () => {
    expect(numbersIn('Hotels need seventy-five percent commercial zoning.')).toEqual([75]);
    expect(numbersIn('A twenty five million dollar plan.')).toEqual([25e6]);
    expect(numbersIn('We have three disasters and one budget.')).toEqual([]);
    expect(numbersIn('It costs 40,000 dollars.')).toEqual([40000]);
    expect(strayNumbers('needs seventy-five percent', { rule: 'needs 25%' })).toEqual(['75']);
    expect(strayNumbers('needs twenty-five percent', { rule: 'needs 25%' })).toEqual([]);
  });
  it('inflected unsafe words are caught too', () => {
    expect(checkSpoken('This moratorium is killing my business.', {})).toMatch(/safe/);
    expect(checkSpoken('Everybody hates this plan.', {})).toMatch(/safe/);
    expect(checkSpoken('The deadline is Friday, folks.', {})).toBeNull();
  });
  it('ids are own properties only', () => {
    expect(isCardId('constructor')).toBe(false);
    expect(isComboId('toString')).toBe(false);
    expect(explainEligibility('constructor', 'west-avenue')).toBeNull();
    expect(checkPlay('mayor', 8, 'toString', 'west-avenue', 1)).toBe('Pick a card.');
  });
  it('a twist narrative framed as real news is replaced by the template', () => {
    const v = validateEventProposal({ type: 'surge-warning', district: 'south-pointe', magnitude: 2, narrative: 'Breaking: the National Weather Service has issued a real hurricane warning for South Pointe tonight.', tension: 'high' }, crisisCtx, 'gemini');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.narrative).not.toMatch(/Weather Service|Breaking|real/);
    expect(v.clamped.join(' ')).toMatch(/real news/);
  });
});

describe('dialogue and reactions', () => {
  const facts = { round: 2, crisis: 'Oceanfront hotel boom' };
  it('accepts a short, in-vocabulary line', () => {
    const v = validateDialogue({ speaker: 'fisherman', line: 'Another marina? My boat is about to become a tourist attraction.', reaction: 'mock', district: 'west-avenue' }, { speakers: [...speakers], facts });
    expect(v.ok).toBe(true);
  });
  it('rejects unknown speakers, unknown reactions, long lines, invented numbers and unsafe words', () => {
    const ctx = { speakers: [...speakers], facts };
    expect(validateDialogue({ speaker: 'governor', line: 'Hello there, everyone, nice day.', reaction: 'celebrate' }, ctx).ok).toBe(false);
    expect(validateDialogue({ speaker: 'mayor', line: 'Hello there, everyone, nice day.', reaction: 'dance' }, ctx).ok).toBe(false);
    expect(validateDialogue({ speaker: 'mayor', line: 'word '.repeat(30), reaction: 'worry' }, ctx).ok).toBe(false);
    expect(validateDialogue({ speaker: 'mayor', line: 'This will cost us 40 million dollars at least.', reaction: 'worry' }, ctx)).toMatchObject({ ok: false, reasons: [expect.stringMatching(/numbers not in the facts: 40/)] });
    expect(validateDialogue({ speaker: 'mayor', line: 'Round 2 and I already hate this job.', reaction: 'worry' }, ctx).ok).toBe(false);
    expect(validateDialogue('just a string', ctx).ok).toBe(false);
  });
  it('a speaker who is not on the map cannot talk; an unknown district is dropped, not trusted', () => {
    expect(validateDialogue({ speaker: 'resort', line: 'Synergy is in the air today, friends.', reaction: 'celebrate' }, { speakers: ['mayor', 'fisherman'], facts }).ok).toBe(false);
    const v = validateDialogue({ speaker: 'mayor', line: 'Synergy is in the air today, friends.', reaction: 'celebrate', district: 'atlantis' }, { speakers: [...speakers], facts });
    expect(v.ok && v.value.district).toBe(null);
  });
  it('reactions only target things that exist', () => {
    const board = buildBoard(2, [play('resort', 'hotel-development', 'collins-mid-beach')]);
    expect(validateReaction({ speaker: 'activist', reaction: 'protest', target: board.proposals[0]!.id }, { speakers: [...speakers], board }).ok).toBe(true);
    expect(validateReaction({ speaker: 'activist', reaction: 'protest', target: 'r9-ghost' }, { speakers: [...speakers], board }).ok).toBe(false);
    expect(validateReaction({ speaker: 'activist', reaction: 'riot' }, { speakers: [...speakers], board }).ok).toBe(false);
  });
  it('validated lines replace template bubbles; the rest stay', () => {
    const t = crisisBubbles(authoredScenario(null).crises[1]!, ['mayor', 'activist', 'resort', 'resident']);
    const merged = mergeDialogue(t, [{ speaker: 'mayor', line: 'Three disasters and one budget. Lovely.', reaction: 'worry', district: null }]);
    expect(merged.find((b) => b.speaker === 'mayor')).toMatchObject({ source: 'gemini', text: 'Three disasters and one budget. Lovely.' });
    expect(merged.filter((b) => b.source === 'template')).toHaveLength(t.length - 1);
  });
});

describe('negotiation hints and combos', () => {
  const board = buildBoard(2, [play('resort', 'hotel-development', 'south-pointe'), play('activist', 'environmental-challenge', 'south-pointe'), play('resident', 'public-access-guarantee', 'south-pointe')]);
  const players = (['mayor', 'activist', 'resort', 'resident'] as PersonaId[]).map((p) => ({ seat: seat[p], persona: p, influence: 5, moved: false }));

  it('the engine finds the moves that flip an outcome (accepting the setback un-blocks the hotel)', () => {
    const c = negotiationCandidates(board, [], startCity(), players);
    const accept = c.find((x) => x.kind === 'accept' && x.compromiseId?.includes('setback'));
    expect(accept).toMatchObject({ seat: 2, from: 'blocked' });
    for (const m of c.filter((x) => x.kind === 'move')) expect(m.from).not.toBe(m.to);
    const hints = templateHints(board, c, combosInReach(board));
    expect(hints[0]!.kind).toBe('accept');
    expect(hints.map((h) => h.kind)).toContain('combo'); // eco-resort is in reach
  });

  it('Gemini may only pick hints the engine found', () => {
    const hints = templateHints(board, negotiationCandidates(board, [], startCity(), players), combosInReach(board));
    const facts = { hints };
    expect(validateSuggestion({ hint: hints[0]!.id, pitch: 'Accept the setback and your hotel gets built.' }, hints, facts)).toMatchObject({ ok: true, value: { source: 'gemini' } });
    expect(validateSuggestion({ hint: 'h-made-up', pitch: 'Bribe the council.' }, hints, facts).ok).toBe(false);
    expect(validateSuggestion({ hint: hints[0]!.id, pitch: 'It will earn you 75 points.' }, hints, facts).ok).toBe(false);
    expect(validateSuggestion(42, hints, facts).ok).toBe(false);
  });

  it('hints are shared fairly: seats take turns, and each hint id names the outcome it predicts', () => {
    const b = buildBoard(1, [play('mayor', 'drainage-upgrade', 'west-avenue'), play('activist', 'living-shoreline', 'south-pointe'), play('resort', 'hotel-development', 'collins-mid-beach'), play('resident', 'neighborhood-petition', 'collins-mid-beach')]);
    const all = (['mayor', 'activist', 'resort', 'resident'] as PersonaId[]).map((p) => ({ seat: seat[p], persona: p, influence: 8, moved: false }));
    const cands = negotiationCandidates(b, [], startCity(), all);
    const hints = templateHints(b, cands, combosInReach(b));
    expect(new Set(hints.map((h) => h.seat)).size).toBeGreaterThanOrEqual(Math.min(4, new Set(cands.map((c) => c.seat)).size));
    for (const h of hints) if (h.kind !== 'combo') expect(h.id).toMatch(/-(approved|delayed|rejected|blocked|unfunded)-(approved|delayed|rejected|blocked|unfunded)$/);
  });

  it('a pitch must describe its own hint\'s move', () => {
    const hints = templateHints(board, negotiationCandidates(board, [], startCity(), players), combosInReach(board));
    const accept = hints.find((h) => h.kind === 'accept')!;
    expect(validateSuggestion({ hint: accept.id, pitch: 'Oppose the hotel and it is gone for good.' }, hints, {}).ok).toBe(false);
    expect(validateSuggestion({ hint: accept.id, pitch: 'Take the setback deal and the hotel goes through.' }, hints, {}).ok).toBe(true);
  });

  it('combo suggestions must be authored and in reach; novel ideas are kept apart', () => {
    const reach = combosInReach(board);
    const id = board.proposals[0]!.id;
    const ok = validateComboSuggestion({ combo: 'eco-resort', proposalIds: [id], explanation: 'A greener hotel the activist can live with.', novelIdea: 'Hotel funds a turtle hatchery.' }, reach, {});
    expect(ok).toMatchObject({ ok: true, value: { novelIdea: 'Hotel funds a turtle hatchery.' } });
    expect(validateComboSuggestion({ combo: 'turtle-hatchery', proposalIds: [id], explanation: 'x y z' }, reach, {}).ok).toBe(false);
    expect(validateComboSuggestion({ combo: 'hybrid-shoreline', proposalIds: [id], explanation: 'Seawall plus dunes.' }, reach, {}).ok).toBe(false);
    expect(validateComboSuggestion({ combo: 'eco-resort', proposalIds: ['r9-nope'], explanation: 'A greener hotel.' }, reach, {}).ok).toBe(false);
    // An unsafe or number-inventing idea is dropped (the suggestion itself stands); an unsafe explanation is refused.
    const dropped = validateComboSuggestion({ combo: 'eco-resort', proposalIds: [id], explanation: 'A greener hotel the activist can live with.', novelIdea: 'Give hotels a 500 million dollar tax break, you idiots.' }, reach, {});
    expect(dropped).toMatchObject({ ok: true, value: { novelIdea: null } });
    expect(validateComboSuggestion({ combo: 'eco-resort', proposalIds: [id], explanation: 'Only a stupid owner would refuse this green deal.' }, reach, {}).ok).toBe(false);
  });
});

describe('explanations come from the engine and the GIS facts', () => {
  it('why a hotel cannot go in North Beach', () => {
    const e = explainEligibility('hotel-development', 'north-beach-oceanside')!;
    expect(e.answer).toMatch(/cannot go in North Beach Oceanside: 24% .*zoned for hotel or commercial use \(needs 25%\)/);
    expect(e.source).toBe('template');
    expect(explainEligibility('hotel-development', 'atlantis')).toBeNull();
  });
});
