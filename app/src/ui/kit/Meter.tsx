// A glossy meter, used for the material budget and (once the engine lands) settlement.
// `pending` is the honest state: nothing measured yet, so an empty dashed trough, never a number.
import { Meter as BaseMeter } from '@base-ui/react/meter';
import { cx } from './cx';

interface Common {
  label: string;
  className?: string;
}

export type MeterProps = Common &
  (
    | { pending?: false; value: number; max: number; unit?: string; pendingText?: never }
    | { pending: true; pendingText?: string; value?: never; max?: never; unit?: never }
  );

export function Meter(props: MeterProps) {
  if (props.pending) {
    return (
      <div className={cx('meter', props.className)} data-state="pending" role="status">
        <div className="meter__head">
          <span>{props.label}</span>
          <span>{props.pendingText ?? 'Engine pending'}</span>
        </div>
        <div className="meter__track" />
      </div>
    );
  }

  const { value, max, label, unit, className } = props;
  const ratio = max > 0 ? value / max : 0;
  const state = ratio > 1 ? 'over' : ratio >= 0.9 ? 'near' : 'ok';
  const shown = Math.min(100, Math.max(0, ratio * 100));
  return (
    <BaseMeter.Root value={value} min={0} max={max} className={cx('meter', className)} data-state={state}>
      <div className="meter__head">
        <BaseMeter.Label>{label}</BaseMeter.Label>
        <span className="tabular">
          {value.toLocaleString()} / {max.toLocaleString()}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <BaseMeter.Track className="meter__track">
        <BaseMeter.Indicator className="meter__bar" style={{ width: `${shown}%` }} />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}
