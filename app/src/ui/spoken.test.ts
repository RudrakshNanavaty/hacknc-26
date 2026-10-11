import { describe, expect, it } from 'vitest';
import { spokenForm } from './spoken';

describe('spokenForm', () => {
  it('keeps short lines whole and drops a round label', () => {
    expect(spokenForm('Round 2: Hotels rise on Collins.')).toBe('Hotels rise on Collins.');
  });
  it('cuts a briefing paragraph to its first sentences', () => {
    const t = "Round 1: 72nd Street complex clashes over rooftop pool. North Beach's GO Bond complex grew in cost and drew resident objections to a rooftop Olympic pool and to moving the library, which needs a referendum. Planners now decide how to handle this massive neighborhood investment.";
    const s = spokenForm(t);
    expect(s.length).toBeLessThanOrEqual(190);
    expect(s.startsWith('72nd Street complex clashes over rooftop pool.')).toBe(true);
    expect(s).not.toMatch(/^Round/);
    expect(s.endsWith('.')).toBe(true);
  });
  it('never returns nothing for a long unbroken line', () => {
    expect(spokenForm('word '.repeat(100)).length).toBeGreaterThan(0);
    expect(spokenForm('word '.repeat(100)).length).toBeLessThanOrEqual(171);
  });
});
