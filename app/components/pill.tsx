import type { ComponentProps } from 'react';

type PillProps = Omit<ComponentProps<'button'>, 'type'> & {
  size?: 'sm' | 'md';
  muted?: boolean;
};

export function Pill({ size = 'sm', muted = false, className, ...rest }: PillProps) {
  const classes = [
    'inline-flex items-center justify-center rounded-full border-2 font-mono leading-none transition-colors duration-150',
    size === 'sm' ? 'text-[11px] px-3 py-1' : 'text-[13.5px] px-[13px] py-[5px] font-semibold',
    muted
      ? 'border-hair text-ink-3 cursor-default'
      : 'border-line text-ink-2 hover:bg-yellow hover:text-on-bright cursor-pointer active:translate-x-px active:translate-y-px',
    className,
  ].filter(Boolean).join(' ');

  return <button {...rest} type="button" className={classes} />;
}
