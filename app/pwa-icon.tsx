import { ImageResponse } from 'next/og';
import { activeLanguage } from '@/lib/languages';

export function pwaIcon(size: number) {
  return new ImageResponse(
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: activeLanguage.pwaIconColors.background,
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        width: '76%',
        height: '76%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `${Math.round(size * 0.035)}px solid ${activeLanguage.pwaIconColors.ink}`,
        borderRadius: size * 0.2,
        color: activeLanguage.pwaIconColors.ink,
        fontSize: size * 0.5,
        WebkitTextStroke: `${Math.round(size * 0.04)}px ${activeLanguage.pwaIconColors.ink}`,
      }}>S</div>
    </div>,
    { width: size, height: size },
  );
}
