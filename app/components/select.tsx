import type { ComponentProps } from 'react';

type SelectProps = ComponentProps<'select'> & {
  variant: 'pill' | 'panel';
  selectClassName?: string;
};

const styles = {
  pill: {
    wrapper: 'border-line bg-yellow text-on-bright hover:brightness-105 relative flex min-h-11 sm:min-h-9 items-center rounded-full border-2 text-[13px] font-bold transition-[filter] duration-150',
    select: 'font-display w-full cursor-pointer appearance-none self-stretch bg-transparent py-1 pr-6 pl-3 tracking-[0.04em] outline-none',
    arrow: 'pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[9px] opacity-60',
  },
  panel: {
    wrapper: 'border-line bg-panel hover:bg-soft relative flex w-full items-center rounded-xl border-2 transition-colors',
    select: 'w-full cursor-pointer appearance-none bg-transparent py-2 pr-8 pl-3 font-mono text-xs outline-none focus:shadow-[3px_3px_0_var(--line)]',
    arrow: 'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[9px] opacity-60',
  },
};

export function Select({ variant, className, selectClassName, ...rest }: SelectProps) {
  const style = styles[variant];
  const selectStyle = variant === 'pill' && /(?:^|\s)w-/.test(selectClassName ?? '')
    ? style.select.replace('w-full ', '')
    : style.select;
  return (
    <span className={[style.wrapper, className].filter(Boolean).join(' ')}>
      <select {...rest} className={[selectStyle, selectClassName].filter(Boolean).join(' ')} />
      <span aria-hidden="true" className={style.arrow}>▾</span>
    </span>
  );
}
