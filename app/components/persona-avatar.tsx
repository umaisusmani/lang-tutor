import type { PersonaProfile } from '@/lib/personas';

/**
 * The persona's round avatar, or their initial when the row has no image.
 *
 * A plain <img>, not next/image: the files are small SVGs from /public, which
 * next/image doesn't optimize anyway (it passes SVGs through untouched unless
 * dangerouslyAllowSVG is set), so it would only add a wrapper.
 */
export function PersonaAvatar({
  persona,
  size = 32,
  className,
}: {
  persona: PersonaProfile;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };

  if (!persona.avatar_url) {
    return (
      <span
        aria-hidden
        style={style}
        className={`border-line bg-yellow text-on-bright flex flex-none items-center justify-center rounded-full border-2 text-sm font-extrabold ${className ?? ''}`}
      >
        {persona.name.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={persona.avatar_url}
      alt=""
      width={size}
      height={size}
      style={style}
      className={`border-line flex-none rounded-full border-2 ${className ?? ''}`}
    />
  );
}
