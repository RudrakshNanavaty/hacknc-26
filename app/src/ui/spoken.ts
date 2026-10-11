// What is worth saying aloud of a written line. Pure, so it is tested without a browser.
/**
 * What is worth saying of a written line: no "Round 2:" label, and the first sentence or two, so a
 * briefing paragraph is a few seconds of speech (and a few credits), not half a minute.
 */
export function spokenForm(text: string, max = 170): string {
  const clean = text.replace(/^Round \d+:\s*/i, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [clean];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).length > max) break;
    out += s;
    if (out.length >= max * 0.5) break;
  }
  out = (out || clean).trim();
  if (out.length > max) {
    // One long sentence: stop at a word boundary.
    const cut = out.slice(0, max);
    out = cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2))).trim();
  }
  return out;
}
