// Dev only (/glb-lab): the character portraits exactly as the game uses them.
import { ensurePortraits, usePortrait, type CharacterKey } from '../characters/portraits';

const KEYS: CharacterKey[] = ['mayor', 'activist', 'resort', 'resident', 'anchor'];

function Row({ k }: { k: CharacterKey }) {
  const p = usePortrait(k);
  return (
    <div className="glass flex items-end gap-4 !p-2">
      <b className="w-20 text-13">{k}</b>
      {p ? (
        <>
          <img src={p.full} height={200} alt="" />
          <img src={p.bust} height={200} alt="" />
          <img src={p.face} width={120} alt="" />
          <span className="face-orb" style={{ width: 44, height: 44 }}><img src={p.face} alt="" /></span>
        </>
      ) : <span className="text-13">rendering...</span>}
    </div>
  );
}

export function GlbLab() {
  void ensurePortraits();
  return (
    <main className="min-h-full p-4" style={{ background: 'linear-gradient(180deg,#bfe8ff,#5bb7e8)' }}>
      <h1 className="font-display text-32 font-black">Character portraits</h1>
      <div className="flex flex-col gap-3">{KEYS.map((k) => <Row key={k} k={k} />)}</div>
    </main>
  );
}
