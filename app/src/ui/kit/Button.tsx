// The Aqua gel button. Gel is for primary actions; secondary actions use variant="glass".
// Behaviour comes from Base UI's Button (focus, disabled, keyboard). `LinkButton` gives the same
// look to a router link, because a link is not a button and must stay an <a>.
import type { ReactNode } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { Link } from '../../router';
import { cx } from './cx';

export type ButtonVariant = 'aqua' | 'sun' | 'seagrass' | 'coral' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Look {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export type ButtonProps = Look &
  Omit<BaseButton.Props, 'className'> & {
    className?: string;
    /** The action is running: disables the button and shows a spinner. */
    busy?: boolean;
  };

export function Button({ variant = 'glass', size = 'md', busy, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <BaseButton
      className={cx('gel', className)}
      data-variant={variant}
      data-size={size === 'md' ? undefined : size}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="gel__spinner" aria-hidden="true" />}
      {children}
    </BaseButton>
  );
}

export function LinkButton({
  to,
  variant = 'glass',
  size = 'md',
  className,
  children,
}: Look & { to: string; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={cx('gel', className)} data-variant={variant} data-size={size === 'md' ? undefined : size}>
      {children}
    </Link>
  );
}
