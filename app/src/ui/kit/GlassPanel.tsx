// A pane of liquid glass. Use for plates and cards; do not nest more than two deep.
import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { cx } from './cx';

export type GlassPanelProps<T extends ElementType = 'div'> = {
  /** The element to render (section, aside, form ...). */
  as?: T;
  tone?: 'clear' | 'tinted';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'lg' | 'md' | 'pill';
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'tone' | 'padding' | 'radius'>;

export function GlassPanel<T extends ElementType = 'div'>({
  as,
  tone = 'clear',
  padding = 'md',
  radius = 'lg',
  className,
  ...rest
}: GlassPanelProps<T>) {
  const Tag: ElementType = as ?? 'div';
  return (
    <Tag
      className={cx('glass', className as string | undefined)}
      data-tone={tone}
      data-padding={padding === 'none' ? undefined : padding}
      data-radius={radius === 'lg' ? undefined : radius}
      {...rest}
    />
  );
}
