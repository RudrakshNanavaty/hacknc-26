// /kit (dev only): every kit component and state over the backdrop, for reviewing the Frutiger Aero
// look before real screens use it. Not linked from anywhere; hidden in production builds.
// Laid out the way screens should be: floating chrome in glass, content grouped by spacing inside
// one sheet, and the HUD straight on the water.
import { useEffect, useState } from 'react';
import { AVATARS, MATERIAL_BUDGET, REFERENCE_TILES, materialOf, type AvatarId } from '@shared';
import {
  Alert, Avatar, Backdrop, Button, Field, GlassPanel, LinkButton, Meter, Select, Tag, TextInput, WorkshopLayout,
} from '../ui/kit';

const SWATCHES = [
  ['sky', '#dff4ff'], ['aqua', '#2bb6e6'], ['aqua-deep', '#0a6fb3'], ['lagoon', '#12a89a'], ['seagrass', '#2f9e4c'],
  ['sun', '#ffc93d'], ['coral', '#e5533f'], ['sand', '#f4ecd3'], ['deep', '#06304d'], ['foam', '#ffffff'],
] as const;

function Specimen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="t-heading">{title}</h2>
      {children}
    </section>
  );
}

export function Kit() {
  const [research, setResearch] = useState(false);
  const [busyBg, setBusyBg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<AvatarId>(AVATARS[0]);
  const [pick, setPick] = useState(REFERENCE_TILES[1]!.id);
  const [secondsLeft, setSecondsLeft] = useState(42);
  const tile = REFERENCE_TILES.find((t) => t.id === pick)!;

  useEffect(() => {
    document.documentElement.dataset.mode = research ? 'research' : '';
    return () => {
      delete document.documentElement.dataset.mode;
    };
  }, [research]);

  return (
    <div className="aero min-h-dvh">
      <Backdrop />
      {busyBg && (
        <div
          aria-hidden="true"
          className="fixed inset-0"
          style={{
            zIndex: -1,
            background:
              'repeating-linear-gradient(45deg, #06304d 0 24px, #ffd45e 24px 48px, #ff7a6b 48px 72px, #ffffff 72px 96px)',
          }}
        />
      )}

      <GlassPanel
        as="nav"
        aria-label="Kit"
        radius="pill"
        padding="sm"
        className="sticky top-3 z-10 mx-auto mt-3 flex max-sm:rounded-[20px] w-[min(100%_-_2rem,64rem)] flex-wrap items-center gap-2"
      >
        <LinkButton to="/" size="sm">Back to the ocean</LinkButton>
        <span className="t-heading mx-2 hidden sm:inline">Aero kit</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" aria-pressed={research} onClick={() => setResearch((v) => !v)}>
            Research Mode {research ? 'on' : 'off'}
          </Button>
          <Button size="sm" aria-pressed={busyBg} onClick={() => setBusyBg((v) => !v)}>
            Busy background {busyBg ? 'on' : 'off'}
          </Button>
        </span>
      </GlassPanel>

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-16 pt-12 sm:px-6">
        <header className="flex max-w-2xl flex-col gap-3">
          <h1 className="t-display">Aero kit</h1>
          <p className="text-18 t-muted">Glass for the chrome, gel for the one action that matters, the ocean for colour.</p>
        </header>

        <GlassPanel padding="lg" className="flex flex-col gap-10">
          <Specimen title="Type">
            <div className="flex flex-col gap-2">
              <p className="t-display">Build a better reef</p>
              <p className="t-title">Kāneʻohe Bay, round 2</p>
              <p className="t-heading">Simulated settlement</p>
              <p className="max-w-prose">
                Body text sits on glass at full strength. Hierarchy comes from size and weight, not from fading the colour.
              </p>
              <p className="t-label t-muted">Label, 13 px semibold</p>
            </div>
          </Specimen>

          <Specimen title="Colour">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
              {SWATCHES.map(([name, hex]) => (
                <li key={name} className="flex items-center gap-3">
                  <span
                    className="size-8 flex-none rounded-full"
                    style={{ background: hex, boxShadow: 'inset 0 0 0 1px rgb(4 40 70 / 0.18)' }}
                  />
                  <span className="t-label flex flex-col">
                    {name}
                    <span className="tabular t-muted font-normal">{hex}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Specimen>

          <Specimen title="Buttons">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="aqua" size="lg">Test it</Button>
                <Button variant="aqua">Start the round</Button>
                <Button variant="sun">Join</Button>
                <Button variant="seagrass">Export JSON</Button>
                <Button variant="coral">Leave room</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg">Compare</Button>
                <Button>Undo</Button>
                <Button size="sm">Remove</Button>
                <LinkButton to="/research">Research Mode</LinkButton>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="aqua" disabled>Disabled</Button>
                <Button disabled>Disabled</Button>
                <Button variant="aqua" busy={busy} onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 1800); }}>
                  {busy ? 'Testing' : 'Click for busy'}
                </Button>
              </div>
            </div>
          </Specimen>

          <Specimen title="Meters">
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <Meter label="Material" value={2400} max={MATERIAL_BUDGET} unit="voxels" />
              <Meter label="Near the budget" value={5700} max={MATERIAL_BUDGET} unit="voxels" />
              <Meter label="Over the budget" value={6400} max={MATERIAL_BUDGET} unit="voxels" />
              <Meter label="Simulated settlement" pending />
            </div>
          </Specimen>

          <Specimen title="Tags and alerts">
            <div className="flex flex-wrap gap-2">
              <Tag provenance="measured" /><Tag provenance="published" /><Tag provenance="model" />
              <Tag provenance="game-defined" /><Tag>Neutral</Tag><Tag tone="coral">Next</Tag>
            </div>
            <Alert>The server did not take the experiment. Is it running?</Alert>
            <Alert tone="info">Round 2 · building starts in 12 s</Alert>
          </Specimen>

          <Specimen title="Fields and avatars">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name"><TextInput placeholder="Diver" maxLength={20} /></Field>
              <Field label="Reef"><Select defaultValue="kaneohe"><option value="kaneohe">Kāneʻohe Bay</option><option value="heron">Heron Island</option></Select></Field>
            </div>
            <div className="flex flex-wrap gap-3" role="group" aria-label="Pick a diver">
              {AVATARS.slice(0, 8).map((a, i) => (
                <button key={a} type="button" aria-pressed={a === avatar} disabled={i === 3} onClick={() => setAvatar(a)} className="rounded-full">
                  <Avatar id={a} selected={a === avatar} disabled={i === 3} />
                </button>
              ))}
            </div>
          </Specimen>
        </GlassPanel>

        <div className="grid gap-4 sm:grid-cols-3">
          <GlassPanel>
            <p className="t-heading">Clear glass</p>
            <p>Floating chrome: bars, palette, drawer.</p>
          </GlassPanel>
          <GlassPanel tone="tinted">
            <p className="t-heading">Tinted glass</p>
            <p>The one surface that should lead.</p>
          </GlassPanel>
          <GlassPanel className="flex flex-col gap-2">
            <p className="t-heading">With a well</p>
            <div className="well px-3 py-2">Inner content sits in a flat well. Blur never nests.</div>
          </GlassPanel>
        </div>

        <WorkshopLayout
          title="Kāneʻohe Bay"
          secondsLeft={secondsLeft}
          material={{ used: materialOf(tile.design), budget: MATERIAL_BUDGET }}
          palette={
            <ul className="flex flex-col gap-2">
              {['Block', 'Ridge', 'Arch', 'Cavity'].map((p) => <li key={p}><Button size="sm" className="w-full">{p}</Button></li>)}
            </ul>
          }
          stage={
            <div className="flex h-full min-h-[24rem] flex-col justify-between gap-4 p-5">
              <p className="t-muted">Stage placeholder: the 3D builder renders here. Until then, pick a reference tile.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {REFERENCE_TILES.map((t) => (
                  <label
                    key={t.id}
                    className="well cursor-pointer p-3"
                    style={t.id === pick ? { boxShadow: '0 0 0 2px var(--aqua-deep)' } : undefined}
                  >
                    <input type="radio" name="tile" className="sr-only" checked={t.id === pick} onChange={() => setPick(t.id)} />
                    <span className="t-heading block">{t.name}</span>
                    <span className="t-label t-muted block font-normal">{t.source}</span>
                  </label>
                ))}
              </div>
            </div>
          }
          drawer={
            <div className="flex flex-col gap-4">
              <Meter label="Simulated settlement" pending />
              <p className="tabular">Material: {materialOf(tile.design)} voxels</p>
              <Button size="sm" onClick={() => setSecondsLeft((s) => (s > 30 ? 25 : 42))}>Toggle timer urgency</Button>
            </div>
          }
          action={<Button variant="aqua" size="lg">Test it</Button>}
        />
      </main>
    </div>
  );
}
