import type { ComponentProps } from 'react';

type PillOptions = {
  size?: 'sm' | 'md';
  muted?: boolean;
  active?: boolean;
  className?: string;
};

type PillProps = ComponentProps<'button'> & PillOptions & { hitArea?: boolean };

export function pillClassName({ size = 'sm', muted = false, active = false, className }: PillOptions = {}) {
  return [
    'inline-flex items-center justify-center whitespace-nowrap rounded-full border-2 font-mono leading-none transition-[background-color,color,transform,box-shadow] duration-120 ease-out',
    size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-[13px] py-[5px] text-[13.5px] font-semibold',
    muted
      ? 'border-hair bg-panel text-ink-3 cursor-default'
      : `border-line cursor-pointer shadow-[2px_2px_0_var(--line)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none group-active/pill:translate-x-[2px] group-active/pill:translate-y-[2px] group-active/pill:shadow-none ${active ? 'bg-yellow text-on-bright' : 'bg-panel text-ink hover:bg-yellow hover:text-on-bright group-hover/pill:bg-yellow group-hover/pill:text-on-bright'}`,
    className,
  ].filter(Boolean).join(' ');
}

export function Pill({ size = 'sm', muted = false, active = false, hitArea = false, className, type = 'button', children, ref, ...rest }: PillProps) {
  if (hitArea) {
    return (
      <button {...rest} ref={ref} type={type} className={['group/pill inline-flex min-h-11 min-w-11 items-center justify-center disabled:cursor-default', className].filter(Boolean).join(' ')}>
        <span className={pillClassName({ size, muted, active })}>{children}</span>
      </button>
    );
  }

  return <button {...rest} ref={ref} type={type} className={pillClassName({ size, muted, active, className })}>{children}</button>;
}
