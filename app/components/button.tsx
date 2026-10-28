import Link from 'next/link';
import type { ComponentProps } from 'react';

type ButtonStyle = {
  variant?: 'primary' | 'secondary' | 'dark' | 'danger';
  size?: 'md' | 'lg';
};

type ButtonProps = ButtonStyle & (
  | ({ href: string } & Omit<ComponentProps<typeof Link>, 'href'>)
  | ({ href?: never } & ComponentProps<'button'>)
);

const base = 'inline-flex items-center justify-center gap-2 rounded-xl border-2 border-line min-h-11 cursor-pointer disabled:cursor-default';
const styles = {
  primary: 'bg-yellow text-on-bright font-display tracking-[0.04em] shadow-[3px_3px_0_var(--line)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_var(--line)] disabled:opacity-50',
  secondary: 'bg-panel text-ink font-bold transition-transform hover:shadow-[3px_3px_0_var(--line)] hover:-translate-x-px hover:-translate-y-px disabled:opacity-50',
  dark: 'bg-ink text-paper font-display tracking-[0.04em] transition-colors hover:bg-accent hover:text-on-accent disabled:cursor-default disabled:opacity-40',
  danger: 'bg-orange text-on-bright font-bold transition-transform hover:shadow-[3px_3px_0_var(--line)] hover:-translate-x-px hover:-translate-y-px disabled:opacity-50',
};

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', className, href, ...rest } = props;
  const sizeClass = variant === 'dark'
    ? [
        /(?:^|\s)px-/.test(className ?? '') ? '' : 'px-3',
        /(?:^|\s)py-/.test(className ?? '') ? '' : 'py-[5px]',
        /(?:^|\s)text-(?:xs|sm|base|lg|xl|\d|\[)/.test(className ?? '') ? '' : 'text-[15px]',
      ].filter(Boolean).join(' ')
    : `px-4 py-3 ${size === 'lg' ? 'text-xl' : 'text-base'}`;
  const classes = [base, styles[variant], sizeClass, className].filter(Boolean).join(' ');

  if (href !== undefined) {
    return <Link href={href} {...rest as Omit<ComponentProps<typeof Link>, 'href'>} className={classes} />;
  }

  return <button {...rest as ComponentProps<'button'>} className={classes} />;
}
