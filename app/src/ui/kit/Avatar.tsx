// A diver portrait in a glossy ring (Open Peeps, CC0, in app/public/avatars).
import type { AvatarId } from '@shared';
import { cx } from './cx';

export function Avatar({
  id,
  size = 48,
  selected,
  disabled,
  className,
}: {
  id: AvatarId;
  size?: number;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span className={cx('avatar', className)} data-selected={selected || undefined} data-disabled={disabled || undefined}>
      <img src={`/avatars/${id}.svg`} alt="" width={size} height={size} style={{ width: size, height: size }} />
    </span>
  );
}
