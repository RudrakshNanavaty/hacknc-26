import type { ReactNode } from 'react';
import { cx } from './cx';

/** An inline message. Errors announce themselves (role="alert"); info uses role="status". */
export function Alert({
  tone = 'error',
  className,
  children,
}: {
  tone?: 'error' | 'info';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('alert', className)} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
