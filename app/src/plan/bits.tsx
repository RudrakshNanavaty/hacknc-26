// Small pieces of the Planning Edition screens: the budget bar, sources, an option card, who stands where.
import type { ReactNode } from 'react';
import {
  PERSONA_INFO, PLAN_SCENARIOS, ROUND_BUDGET, amendmentOf, configCost, optionOf, previewScore,
  type PersonaId, type PlanConfig, type PlanOption, type PlanScenario, type RoomState, type Stance,
} from '@shared';
import { FaceOrb } from '../game/Players';

const SCENARIOS = new Map(PLAN_SCENARIOS.map((s) => [s.id, s]));
export const scenarioById2 = (id: string) => SCENARIOS.get(id) ?? null;

export const nameOf = (state: RoomState, seat: number) => state.players.find((p) => p.seat === seat)?.name ?? 'Someone';
export const personaOf = (state: RoomState, seat: number): PersonaId | null => state.players.find((p) => p.seat === seat)?.persona ?? null;

/** "7 of 10" as a bar; a pending amendment shows as a lighter extension (or a saving). */
export function BudgetBar({ used, pending = 0, total = ROUND_BUDGET, label = 'Round budget' }: { used: number; pending?: number; total?: number; label?: string }) {
  const over = used + pending > total;
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  return (
    <div className="plan-budget" role="img" aria-label={`${label}: ${used + pending} of ${total} units${over ? ', over budget' : ''}`}>
      <div className="plan-budget-top"><span>💲 {label} <small>(illustrative units)</small></span><b className={over ? 'is-over' : ''}>{used + pending} / {total}</b></div>
      <div className="plan-budget-bar">
        <i className="used" style={{ width: pct(Math.min(used, used + pending)) }} />
        {pending > 0 && <i className={`pending ${over ? 'is-over' : ''}`} style={{ left: pct(used), width: pct(pending) }} />}
        {pending < 0 && <i className="saving" style={{ left: pct(used + pending), width: pct(-pending) }} />}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { official: 'City / official', news: 'News', advocacy: 'Advocacy', industry: 'Industry', other: 'Other' };

/** The story behind a situation: sources as links, how it was checked, what the model may and may not claim. */
export function Sources({ sc, open = false }: { sc: PlanScenario; open?: boolean }) {
  return (
    <details className="plan-more frost" open={open}>
      <summary>📎 {sc.sources.length} sources · {sc.verification.status === 'resolved' ? 'checked, differences resolved' : 'sources checked'}</summary>
      <ul className="plan-sources">
        {sc.sources.map((s) => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a>
            <span className="lchip lchip-aqua">{s.outlet}</span>
            <span className="lchip">{KIND_LABEL[s.kind] ?? s.kind}</span>
          </li>
        ))}
      </ul>
      {sc.verification.notes.length > 0 && <p className="text-[12px] font-bold opacity-80">Notes: {sc.verification.notes.join(' ')}</p>}
      <p className="text-[12px] font-bold opacity-80">Costs here are illustrative game units. The real budgets appear only as quoted facts.</p>
    </details>
  );
}

/** How many of the three mandate points a configuration would give a persona, as stars. */
export function Stars({ n, of = 3 }: { n: number; of?: number }) {
  return <span className="stars" aria-label={`${n} of ${of}`}>{Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? 'on' : ''}>★</i>)}</span>;
}

/** The point system in one glance: what each part is for and what it takes to earn it. */
export function ScoreGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`score-guide ${compact ? 'is-compact' : ''}`} role="group" aria-label="How points work: up to 6 a round">
      <p className="score-guide-head">⭐ Up to <b>6 points</b> a round</p>
      <ul>
        <li title="How well the final plan matches what your role wants. 0 to 3 stars."><span className="sg-icon">🎯</span><b>Goal <em>0–3</em></b>{!compact && <small>The plan gives your role what it wants</small>}</li>
        <li title="You asked for a change that answers your own concern, and it went into the plan. 0 to 2."><span className="sg-icon">🤝</span><b>Deal <em>0–2</em></b>{!compact && <small>Your requested change gets in</small>}</li>
        <li title="Shared: the plan is approved, fits the budget and can legally go ahead. 0 or 1."><span className="sg-icon">🏙️</span><b>City <em>0–1</em></b>{!compact && <small>Approved, affordable, allowed</small>}</li>
      </ul>
    </div>
  );
}

/** A stakeholder's goal for this situation, with where it comes from one tap away. */
export function GoalLine({ sc, persona, you = false }: { sc: PlanScenario; persona: PersonaId; you?: boolean }) {
  const m = sc.mandates[persona];
  return (
    <div className="plan-goal" title={`${m.inferred ? 'Role inference: ' : 'From the story: '}${m.grounding}`}>
      <FaceOrb persona={persona} size={32} />
      <p className="min-w-0 flex-1 text-[14px] leading-tight">
        <b className="vr">{you ? '🎯 Your goal' : PERSONA_INFO[persona].name}:</b> {m.objective}
        <small className="block text-[11px] font-bold opacity-65">{m.inferred ? '⚠ role inference' : 'from the story'}: {m.grounding}</small>
      </p>
    </div>
  );
}

export function OptionCard({ sc, option, persona, tone, onPick, picked, disabled, hint }: {
  sc: PlanScenario;
  option: PlanOption;
  persona: PersonaId;
  tone: number;
  onPick?: () => void;
  picked?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const cfg: PlanConfig = { option: option.id, amendment: null };
  const pv = previewScore(sc, persona, cfg);
  const constraint = sc.constraints.find((k) => k.option === option.id);
  const needs = constraint ? sc.amendments.find((a) => a.addTags.includes(constraint.requires) && a.appliesTo.includes(option.id)) : null;
  return (
    <div className={`plan-card tone-${tone} ${picked ? 'is-picked' : ''}`}>
      <div className="plan-card-head">
        <p className="vr text-[17px] leading-tight">{option.name}</p>
        <span className="plan-cost" title="Illustrative game units out of 10 a round"><b>{option.cost}</b><small>units</small></span>
      </div>
      <p className="text-[13px] font-bold leading-snug">{option.does}</p>
      <ul className="plain-list">
        <li className="hc-good">✅ {option.benefit}</li>
        <li className="hc-bad">⚠️ {option.tradeoff}</li>
        {constraint && <li className="hc-bad">🚧 Needs {needs ? needs.name : 'a safeguard'} to go ahead.</li>}
      </ul>
      <div className="plan-card-foot">
        <span className="text-[12px] font-black" title="How well this project matches your goal (0 to 3 stars)">🎯 Fits your goal <Stars n={pv.mandate} /></span>
        {onPick && <button type="button" className="gel gel-lime gel-sm" disabled={disabled} onClick={onPick}>{picked ? '🔒 Locked' : 'Play card'}</button>}
      </div>
      {hint}
    </div>
  );
}

/** Four seats and where each stands (or what they picked): face, name, a badge. */
export function Table({ state, badge }: { state: RoomState; badge: (seat: number) => ReactNode }) {
  return (
    <ul className="plan-table">
      {state.players.map((p) => (
        <li key={p.seat} className={p.seat === state.you ? 'is-you' : ''}>
          <FaceOrb persona={p.persona} size={30} />
          <span className="min-w-0 flex-1">
            <b className="block truncate">{p.seat === state.you ? 'You' : p.name}</b>
            <small className="block truncate opacity-70">{PERSONA_INFO[p.persona].name}</small>
          </span>
          <span className="plan-badge">{badge(p.seat)}</span>
        </li>
      ))}
    </ul>
  );
}

export const STANCE_ICON: Record<Stance, string> = { support: '👍 Support', oppose: '👎 Oppose' };

export const describe = (sc: PlanScenario, c: PlanConfig) => {
  const o = optionOf(sc, c.option);
  if (!o) return sc.statusQuo.name;
  const a = amendmentOf(sc, c.amendment);
  return a ? `${o.name} + ${a.name}` : o.name;
};
export const costOf = (sc: PlanScenario, c: PlanConfig) => configCost(sc, c);
