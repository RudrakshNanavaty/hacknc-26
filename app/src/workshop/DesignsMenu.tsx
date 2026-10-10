// Start from a reference tile or a saved design; save, export or import. A popover under its trigger.
import { useRef } from 'react';
import { REFERENCE_TILES, designOf, type Piece } from '@shared';
import { Materialize } from '../ui/Materialize';
import { exportJson, exportStl, importJson, saveDesign, savedDesigns } from './files';

const ROW = 'flex w-full items-center justify-between gap-2 rounded-inner-sm px-2 py-2 text-left text-15 font-medium hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';

export function DesignsMenu({ open, pieces, readOnly, onLoad, say }: { open: boolean; pieces: Piece[]; readOnly: boolean; onLoad: (pieces: Piece[], label: string) => void; say: (msg: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const saved = savedDesigns();
  return (
    <Materialize show={open} origin="top right" className="glass-deep absolute top-full right-0 z-10 mt-2 w-72 max-w-[calc(100vw-1rem)] p-3" role="dialog" aria-label="Designs">
      <p className="px-2 text-13 font-semibold text-white/80">Start from</p>
      <ul className="mt-1">
        <li><button className={ROW} disabled={readOnly} onClick={() => onLoad([], 'Empty tile')}>Empty tile</button></li>
        {REFERENCE_TILES.filter((r) => r.id !== 'flat').map((r) => (
          <li key={r.id}>
            <button className={ROW} disabled={readOnly} onClick={() => onLoad(r.design.pieces ?? [], r.name)}>
              <span>{r.name}</span>
              <span className={`chip ${r.kind === 'published' ? 'chip-published' : 'chip-game'}`}>{r.kind === 'published' ? 'Published' : 'Game-made'}</span>
            </button>
          </li>
        ))}
      </ul>
      {saved.length > 0 && (
        <>
          <p className="mt-2 px-2 text-13 font-semibold text-white/80">Saved here</p>
          <ul className="mt-1 max-h-32 overflow-y-auto">
            {saved.map((s) => (
              <li key={s.name}><button className={ROW} disabled={readOnly} onClick={() => onLoad(s.pieces, s.name)}>{s.name}</button></li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/20 pt-3">
        <button className="btn min-h-10 px-3" disabled={readOnly || !pieces.length} onClick={() => {
          const name = `Design ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          say(saveDesign(name, pieces) ? `Saved as “${name}”` : 'Could not save in this browser');
        }}>Save</button>
        <button className="btn min-h-10 px-3" onClick={() => exportJson(pieces)}>JSON</button>
        <button className="btn min-h-10 px-3" disabled={!pieces.length} onClick={() => exportStl(designOf(pieces))}>STL</button>
        <button className="btn min-h-10 px-3" disabled={readOnly} onClick={() => file.current?.click()}>Import</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const res = await importJson(f);
          if ('error' in res) say(res.error);
          else onLoad(res.pieces, f.name);
        }} />
      </div>
    </Materialize>
  );
}
