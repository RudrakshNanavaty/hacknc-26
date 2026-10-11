// The Game Director end to end, with Gemini mocked: fallbacks (no key, timeout, malformed JSON),
// validation inside the room, public hints, the review queue, and deterministic replays.
import { describe, expect, it } from 'vitest';
import { authoredScenario, replayMatch, studioSummary, toCsv, toGeoJson, type CardId, type PersonaId } from '@shared';
import { decisionRows } from './db/tiger';
import { buildServer } from './app';
import { Gemini, type GenerateClient } from './ai/gemini';
import { directorFacts, geminiDirector } from './ai/director';
import { accept, applyDialogue, applyHints, applyScenario, done, getOrCreateRoom, join, move, proposeEarlyEvent, proposeEvent, publicState, rooms, select, setBot, skip, start, type Player, type Room } from './rooms';

const answer = (text: string): GenerateClient => ({ models: { generateContent: async () => ({ text }) as never } });
/** A Gemini that never answers: only the abort signal (the timeout) ends the call. */
const hanging: GenerateClient = {
  models: {
    generateContent: (req) =>
      new Promise((_, reject) => req.config?.abortSignal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })))),
  },
};

let clock = 0;
const tick = () => (clock += 1);

function botRoom(code: string) {
  rooms.delete(code);
  const room = getOrCreateRoom(code, 0);
  const host = join(room, 'Ana', 'mayor');
  for (const p of ['activist', 'resort', 'resident'] as PersonaId[]) setBot(room, host, p, true);
  start(room, host, tick());
  return { room, host };
}

/** Drive the host until the room reaches `round`/`phase` (the host plays a legal card, passes, or skips). */
function advance(room: Room, host: Player, round: number, phase: Room['phase']) {
  for (let guard = 0; guard < 200 && !(room.round === round && room.phase === phase); guard++) {
    if (room.phase === 'select' && !host.selection && host.persona === 'mayor') select(room, host, room.round === 1 ? 'drainage-upgrade' : 'emergency-funding', 'west-avenue', tick());
    else if (room.phase === 'negotiate') done(room, host, tick());
    else skip(room, host, tick());
  }
  expect([room.round, room.phase]).toEqual([round, phase]);
}

describe('Gemini fails soft', () => {
  const facts = { round: 2 };
  it('no key: no Director at all, templates only', () => {
    expect(geminiDirector(new Gemini({ apiKey: '' }))).toBeNull();
  });
  it('a call that hangs times out with an AIError', async () => {
    const d = geminiDirector(new Gemini({ apiKey: 'test', client: hanging, textModels: ['m'] }), 40)!;
    await expect(d.event(facts as never, 2, [])).rejects.toThrow(/timed out/);
    await expect(d.dialogue(facts as never, ['mayor'], 'crisis-2')).rejects.toThrow(/timed out/);
  });
  it('malformed JSON is rejected before it reaches the room', async () => {
    const d = geminiDirector(new Gemini({ apiKey: 'test', client: answer('a twist! a twist!'), textModels: ['m'] }))!;
    await expect(d.hints(facts as never, [], [])).rejects.toThrow(/malformed JSON/);
  });
  it('an explanation with invented numbers is refused', async () => {
    const d = geminiDirector(new Gemini({ apiKey: 'test', client: answer(JSON.stringify({ answer: 'Hotels need 75% commercial zoning here, sorry.' })), textModels: ['m'] }))!;
    await expect(d.explain({ question: 'q', answer: 'Needs 25%.', facts: ['needs 25%'], source: 'template' })).rejects.toThrow(/numbers not in the facts: 75/);
  });
});

describe('the Director inside a room', () => {
  it('a twist: the template is ready at once; a Gemini proposal replaces it only if valid; the record replays without Gemini', () => {
    const { room, host } = botRoom('DRCT');
    advance(room, host, 2, 'crisis');
    expect(room.event).toMatchObject({ source: 'template', round: 2 });

    expect(proposeEvent(room, 'crisis-2', { type: 'tsunami', district: 'south-pointe', magnitude: 2, narrative: 'A wave.', tension: 'high' }, tick())).toBe(false);
    expect(proposeEvent(room, 'crisis-1', { type: 'access-march', district: 'south-pointe', magnitude: 1, narrative: 'Late.', tension: 'low' }, tick())).toBe(false);
    const ok = proposeEvent(room, 'crisis-2', { type: 'access-march', district: 'south-pointe', magnitude: 7, narrative: 'Neighbors march to the sand at South Pointe with handmade signs.', tension: 'high' }, tick());
    expect(ok).toBe(true);
    expect(room.event).toMatchObject({ source: 'gemini', type: 'access-march', magnitude: 3, delta: { access: 3 } });

    const before = room.city.indicators.access;
    advance(room, host, 2, 'select');
    expect(room.eventApplied?.rule).toBe('D1');
    expect(room.city.indicators.access).toBe(before + 3);
    // Too late now: the twist is applied.
    expect(proposeEvent(room, 'crisis-2', { type: 'federal-grant', district: 'west-avenue', magnitude: 1, narrative: 'Money.', tension: 'low' }, tick())).toBe(false);

    advance(room, host, 3, 'final');
    const record = room.record!;
    const r2 = record.rounds[1]!.director!;
    expect(r2.event).toMatchObject({ source: 'gemini', type: 'access-march', magnitude: 3 });
    expect(r2.log.map((l) => [l.source, l.status])).toEqual([['template', 'accepted'], ['gemini', 'rejected'], ['gemini', 'clamped']]);
    expect(record.rounds[2]!.director!.event?.source).toBe('template');

    const replay = replayMatch(record);
    expect(replay.comparable).toBe(true);
    expect(replay.mismatches).toEqual([]);
    expect(replay.final!.scores).toEqual(room.final!.scores);

    // A database may store the record with its keys reordered (Postgres jsonb does): the replay still matches.
    const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as object).reverse().map(([k, x]) => [k, reorder(x)])) : v;
    expect(replayMatch(reorder(structuredClone(record)) as typeof record).matches).toBe(true);
    // A record made under other rules is not replayed with today's engine: it says so instead of "differs".
    const older = replayMatch({ ...structuredClone(record), rulesVersion: 'coastal-clash-rules/1.0.0' });
    expect(older).toMatchObject({ comparable: false, matches: false, mismatches: [] });
    expect(older.reason).toMatch(/1\.0\.0/);

    // Exports carry the twist, marked as fiction, so outcomes it changed are not read as player decisions alone.
    const csv = toCsv([record]);
    expect(csv.split('\n').find((l) => l.includes('twist_event'))).toMatch(/access-march,gemini,true/);
    const geo = toGeoJson([record]);
    expect(geo.features.find((f) => f.properties.record === 'twist_event')?.properties).toMatchObject({ fictional: true, event_source: 'gemini' });
    expect(decisionRows(record).filter((r) => r.kind === 'twist').map((r) => r.status)).toEqual(['gemini', 'template']);

    // Planning Studio counts the Director's work apart from opinion data.
    const studio = studioSummary([record], { humansOnly: false });
    expect(studio.director.twists.map((t) => t.source)).toEqual(['gemini', 'template']);
    expect(studio.director.proposals).toEqual({ accepted: 0, clamped: 1, rejected: 1 });
    expect(studio.findings.some((f) => /twist|AI|Gemini/i.test(f.text))).toBe(false);

    // The stored twist is what drives the replay: change it and the replay no longer matches.
    const tampered = structuredClone(record);
    tampered.rounds[1]!.director!.event = { ...tampered.rounds[1]!.director!.event!, delta: { access: -3 } };
    expect(replayMatch(tampered).matches).toBe(false);
  });

  it('while the scenario desk is still writing, the crisis moment waits; it starts when the scenario arrives', () => {
    rooms.delete('WAZT');
    const room = getOrCreateRoom('WAZT', 0);
    const host = join(room, 'Ana', 'mayor');
    start(room, host, tick());
    expect(room.crisis).toBeNull();
    expect(room.bubbles).toBeNull();
    expect(room.effects.some((e) => e.t === 'crisis')).toBe(false);
    applyScenario(room, authoredScenario(null), tick());
    expect(room.crisis?.round).toBe(1);
    expect(room.bubbles?.key).toBe('crisis-1');
    expect(room.effects.some((e) => e.t === 'crisis')).toBe(true);
    expect(room.event).toBeNull(); // twists start in round 2
  });

  it('a twist prefetched during the previous resolution is validated when its crisis starts', () => {
    const { room, host } = botRoom('PRFT');
    advance(room, host, 1, 'resolve');
    expect(proposeEarlyEvent(room, 1, { type: 'federal-grant', district: 'west-avenue', magnitude: 1, narrative: 'Too late for round one.', tension: 'low' })).toBe(false);
    expect(proposeEarlyEvent(room, 2, { type: 'federal-grant', district: 'west-avenue', magnitude: 2, narrative: 'A grant program eyes the bayfront blocks.', tension: 'low' })).toBe(true);
    advance(room, host, 2, 'crisis');
    expect(room.event).toMatchObject({ source: 'gemini', type: 'federal-grant', delta: { budget: 4 } });
    // An invalid early proposal is logged and the template stays.
    advance(room, host, 2, 'resolve');
    proposeEarlyEvent(room, 3, { type: 'algae-bloom', district: 'north-beach-oceanside', magnitude: 2, narrative: 'Green water.', tension: 'high' });
    advance(room, host, 3, 'crisis');
    expect(room.event!.source).toBe('template');
    expect(room.directorLog.at(-1)).toMatchObject({ source: 'gemini', status: 'rejected' });
  });

  it('verdicts on lines for a resolution land in that round\'s record, and are saved', () => {
    const { room, host } = botRoom('LGRS');
    advance(room, host, 1, 'resolve');
    room.effects.length = 0;
    const facts = directorFacts(publicState(room, null, tick()));
    applyDialogue(room, 'resolve-1', [{ speaker: 'mayor', line: 'Approved and paid for. Somebody frame this moment.', reaction: 'celebrate' }, { speaker: 'kraken', line: 'Release me from the bay at once.', reaction: 'protest' }], facts, tick());
    const log = room.record!.rounds[0]!.director!.log.filter((l) => l.kind === 'dialogue');
    expect(log.map((l) => l.status)).toEqual(['accepted', 'rejected']);
    expect(room.directorLog.filter((l) => l.kind === 'dialogue')).toEqual([]);
    expect(room.effects.some((e) => e.t === 'record')).toBe(true);
  });

  it('"Explain in plain words" explains the latest verdict of a proposal that was delayed and decided later', async () => {
    const down = () => Promise.reject(new Error('down'));
    const app = buildServer({ narrator: null, director: null, scenario: { live: async () => null, write: down } });
    rooms.delete('XPLN');
    const room = getOrCreateRoom('XPLN', 0);
    const mayor = join(room, 'Mae', 'mayor');
    const activist = join(room, 'Kai', 'activist');
    start(room, mayor, tick());
    applyScenario(room, authoredScenario(null), tick());
    skip(room, mayor, tick());
    select(room, mayor, 'drainage-upgrade', 'west-avenue', tick());
    select(room, activist, 'habitat-survey', 'west-avenue', tick()); // a survey has nothing to act on here (it falls back)
    skip(room, mayor, tick());
    const drainage = room.board!.proposals[0]!.id;
    move(room, activist, 'oppose', drainage, tick()); // 1 vs 1: delayed
    for (const p of [mayor, activist]) done(room, p, tick());
    expect(room.history[0]!.resolution.outcomes[0]!.status).toBe('delayed');
    advance(room, mayor, 2, 'negotiate');
    move(room, mayor, 'back', drainage, tick());
    for (const p of [mayor, activist]) if (!p.done) done(room, p, tick());
    expect(room.history[1]!.resolution.outcomes.find((o) => o.proposalId === drainage)!.status).toBe('approved');
    const res = (await app.inject({ method: 'POST', url: '/api/explain', payload: { kind: 'outcome', code: 'XPLN', proposalId: drainage } })).json();
    expect(res.answer).toMatch(/^It was approved/);
    await app.close();
  });

  it('dialogue: validated lines replace template bubbles for the current moment only', () => {
    const { room, host } = botRoom('DLGX');
    advance(room, host, 2, 'crisis');
    const facts = directorFacts(publicState(room, null, tick()));
    const n = applyDialogue(room, 'crisis-2', [
      { speaker: 'mayor', line: 'We have three disasters and one budget. Fantastic.', reaction: 'worry' },
      { speaker: 'mayor', line: 'A second line for the same speaker is ignored.', reaction: 'celebrate' },
      { speaker: 'kraken', line: 'Release me from the bay at once, please.', reaction: 'protest' },
      { speaker: 'fisherman', line: 'This will cost 999 fish, mark my words.', reaction: 'mock' },
    ], facts, tick());
    expect(n).toBe(1);
    const list = room.bubbles!.list;
    expect(list.find((b) => b.speaker === 'mayor')).toMatchObject({ source: 'gemini', reaction: 'worry' });
    expect(list.some((b) => b.speaker === 'fisherman')).toBe(false);
    expect(applyDialogue(room, 'crisis-1', [{ speaker: 'activist', line: 'Too late for this moment, sadly.', reaction: 'worry' }], facts, tick())).toBe(0);
  });

  it('hints are public, found by the engine, worded by the AI at most; novel combo ideas go to review', () => {
    rooms.delete('HNTS');
    const room = getOrCreateRoom('HNTS', 0);
    const resort = join(room, 'Ana', 'resort');
    const activist = join(room, 'Ben', 'activist');
    const mayor = join(room, 'Cy', 'mayor');
    start(room, resort, tick());
    advance(room, resort, 2, 'select');
    const plays: [Player, CardId, string][] = [[resort, 'hotel-development', 'south-pointe'], [activist, 'eco-certification', 'south-pointe'], [mayor, 'fast-track', 'collins-mid-beach']];
    for (const [p, c, d] of plays) select(room, p, c, d, tick());
    skip(room, resort, tick());
    expect(room.phase).toBe('negotiate');

    const forResort = publicState(room, resort, tick()).hints!;
    expect(publicState(room, activist, tick()).hints).toEqual(forResort); // same hints for everyone
    const acceptHint = forResort.list.find((h) => h.kind === 'accept')!;
    expect(acceptHint).toMatchObject({ seat: resort.seat, source: 'template' });
    expect(forResort.list.some((h) => h.kind === 'combo' && h.combo === 'eco-resort')).toBe(true);

    const facts = directorFacts(publicState(room, null, tick()));
    const hotel = room.board!.proposals[0]!.id;
    const n = applyHints(room, forResort.key, {
      suggestions: [{ hint: acceptHint.id, pitch: 'Sterling, take the green label and your hotel sails through.' }, { hint: 'h-invented', pitch: 'Bribe someone.' }],
      combos: [{ combo: 'eco-resort', proposalIds: [hotel], explanation: 'A greener hotel the activist can cheer for.', novelIdea: 'The hotel sponsors a sea turtle nest watch.' }],
    }, facts, tick());
    expect(n).toBe(2);
    expect(room.hints!.list.find((h) => h.id === acceptHint.id)!.source).toBe('gemini');
    expect(room.record!.reviewQueue).toEqual([expect.objectContaining({ idea: 'The hotel sponsors a sea turtle nest watch.', source: 'gemini', round: 2 })]);

    accept(room, resort, acceptHint.compromiseId, tick());
    for (const p of [resort, activist, mayor]) done(room, p, tick());
    const rec = room.record!.rounds[1]!;
    expect(rec.director!.hints.find((h) => h.id === acceptHint.id)).toMatchObject({ followed: true, source: 'gemini' });
    expect(rec.combos).toEqual([expect.objectContaining({ combo: 'eco-resort' })]);
    expect(rec.director!.log.filter((l) => l.kind === 'hint').map((l) => l.status)).toEqual(['accepted', 'rejected']);
  });
});
