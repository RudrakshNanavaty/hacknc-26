// Form controls. TextInput is Base UI's Input; Select is a styled native <select>, which keeps
// mobile pickers and keyboard behaviour for free.
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Input } from '@base-ui/react/input';
import { cx } from './cx';

/** A label above a control. Wrap the control: the label then names it without ids. */
export function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx('field', className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextInput({ className, ...rest }: Omit<ComponentPropsWithoutRef<typeof Input>, 'className'> & { className?: string }) {
  return <Input className={cx('field__control', className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentPropsWithoutRef<'select'>) {
  return <select className={cx('field__control', className)} {...rest} />;
}
