// The Coastal Clash news desk on Gemini. It gets the facts the engine already resolved and writes
// one funny broadcast line about them. It never decides anything, and a line with a number that is
// not in the facts is thrown away (the template line stays). A slow or missing Gemini never blocks
// a match: the room shows the template at once and swaps the line in only if it arrives in time.
import { AIError, GROUNDED, type Gemini } from './gemini';

const SYSTEM = `You are the anchor of "Coastal Clash Live", a playful local TV news desk covering a city-planning game set in the real city of Miami Beach, Florida. Four stakeholders play: the Mayor (overly dramatic), the Environmental Activist (passionate, quotable), the Resort Owner (business-obsessed, says "synergy"), and the Resident (practical, tired of wading to the car).
Write ONE broadcast line (at most 45 words) about the facts you are given. Be witty and warm, never mean. Mention the places by name.
- Report only what the facts say happened. Do not invent outcomes, costs, permissions, laws or effects.
${GROUNDED}`;

/** Digits in a line that do not appear in the facts. */
export function strayNumbers(line: string, facts: unknown): string[] {
  const allowed = new Set((JSON.stringify(facts).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Math.abs(Number(n)))));
  return (line.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !allowed.has(String(Number(n))));
}

export interface Narrator {
  line(facts: unknown): Promise<string>;
}

export function geminiNarrator(gemini: Gemini, timeoutMs = 6_000): Narrator | null {
  if (!gemini.ready()) return null;
  return {
    async line(facts) {
      const { line } = await gemini.json<{ line: string }>({
        system: SYSTEM,
        prompt: JSON.stringify(facts),
        schema: { type: 'object', properties: { line: { type: 'string' } }, required: ['line'] },
        temperature: 0.9,
        timeoutMs,
        check: ({ line }) => {
          if (typeof line !== 'string' || line.trim().length < 10) return 'empty line';
          if (line.length > 400) return 'too long';
          const stray = strayNumbers(line, facts);
          return stray.length ? `numbers not in the facts: ${stray.join(', ')}` : null;
        },
      });
      if (!line?.trim()) throw new AIError('empty line');
      return line.trim();
    },
  };
}
