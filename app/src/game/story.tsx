// The round's real civic story, for every component that shows a card or a character: the story
// names of the dealt cards, each character's part, and the sources. Outside a match (lobby, landing)
// there is no story and cards keep their own names.
import { createContext, useContext, type ReactNode } from 'react';
import { FaceOrb } from './Players';
import { CARDS, PERSONA_INFO, cardName, type CardId, type Crisis, type CrisisStory, type PersonaId, type RoleId, type StorySource } from '@shared';

const CrisisContext = createContext<Crisis | null>(null);

export const CrisisProvider = ({ crisis, children }: { crisis: Crisis | null; children: ReactNode }) => (
  <CrisisContext.Provider value={crisis}>{children}</CrisisContext.Provider>
);

export const useCrisis = () => useContext(CrisisContext);

/** A card as this round's story calls it. */
export function useCard(id: CardId) {
  const crisis = useCrisis();
  const skin = crisis?.skins?.[id];
  return { name: cardName(id, crisis), line: skin?.line ?? null, base: CARDS[id].name, skinned: !!skin && skin.name !== CARDS[id].name };
}

const KIND_ICON: Record<StorySource['kind'], string> = { official: '🏛️', news: '📰', advocacy: '📣', industry: '🏗️', other: '🔗' };

/** Tap-to-open source links. */
export function SourceChips({ sources, max = 4 }: { sources: StorySource[]; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.slice(0, max).map((s) => (
        <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="source-chip" title={s.title}>
          <span aria-hidden>{KIND_ICON[s.kind]}</span> {s.outlet}
        </a>
      ))}
    </div>
  );
}

const BADGE = {
  'sources-checked': { label: 'Sources checked', tone: 'lchip-lime' },
  resolved: { label: 'Sources disagreed, resolved', tone: 'lchip-sun' },
  conflict: { label: 'Sources disagree', tone: 'lchip-coral' },
} as const;

/** The reviewer's verdict on a story's sources, with what they disagreed about. */
export function Verification({ story, detail = false }: { story: CrisisStory; detail?: boolean }) {
  const v = story.verification;
  if (!v) return <span className="lchip" title="No review report for this story">Sources linked</span>;
  const b = BADGE[v.status];
  return (
    <span className="flex flex-col gap-1">
      <span className={`lchip w-fit ${b.tone}`} title={v.notes.join(' · ')}>{b.label}</span>
      {detail && v.notes.length > 0 && (
        <span className="text-13 font-semibold">
          {v.notes.map((n) => <span key={n} className="block">• {n}</span>)}
          {v.resolution && <span className="block"><b>How we handled it:</b> {v.resolution}</span>}
        </span>
      )}
    </span>
  );
}

/** Always-visible evidence for the round's real story: where it comes from and whether it checked out. */
export function EvidenceStrip({ crisis }: { crisis: Crisis }) {
  const s = crisis.story;
  if (!s) return null;
  return (
    <div className="frost flex flex-col gap-1.5 p-2.5" aria-label="Sources for this story">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="lchip lchip-lime">Real story</span>
        <span className="lchip">{s.years}</span>
        <Verification story={s} />
      </p>
      <SourceChips sources={s.sources} max={3} />
    </div>
  );
}

const roleName = (r: RoleId) => PERSONA_INFO[r as PersonaId].name;

/** The real story behind the round: when it happened, who each character stands in for, the sources. */
export function StoryPanel({ crisis, you }: { crisis: Crisis; you: PersonaId | null }) {
  const s = crisis.story;
  if (!s) return null;
  const order: RoleId[] = [...(you ? [you] : []), ...(['mayor', 'activist', 'resort', 'resident'] as RoleId[]).filter((r) => r !== you)];
  return (
    <div className="frost flex flex-col gap-2 p-3">
      <p className="flex flex-wrap items-center gap-2">
        <span className="lchip lchip-lime">Real story</span>
        <span className="vr text-16">{s.title}</span>
        <span className="lchip">{s.years}</span>
      </p>
      <ul className="flex flex-col gap-1.5">
        {order.map((r) => {
          const part = s.roles[r];
          if (!part) return null;
          return (
            <li key={r} className={`story-role ${r === you ? 'is-you' : ''}`}>
              <FaceOrb persona={r as PersonaId} size={32} />
              <span className="min-w-0">
                <b>{r === you ? `You, the ${roleName(r)}` : roleName(r)}</b>
                {part.counterpart && <span className="opacity-75"> · in the real story: {part.counterpart}</span>}
                <span className="block text-13 font-semibold">{part.stance}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {s.facts.length > 0 && (
        <div>
          <p className="text-13 font-black">Facts this round uses</p>
          <ul className="list-disc pl-5 text-13 font-semibold">{s.facts.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      <Verification story={s} detail />
      <SourceChips sources={s.sources} max={8} />
      <p className="text-[11px] opacity-70">
        Facts are as reported by the linked sources{s.retrievedAt ? `, retrieved ${s.retrievedAt}` : ''} (reviewed corpus in Snowflake). Characters stand in for the real sides; game effects are illustrative.
      </p>
    </div>
  );
}
