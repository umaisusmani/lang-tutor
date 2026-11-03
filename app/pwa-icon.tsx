import { ImageResponse } from 'next/og';

export function pwaIcon(size: number) {
  return new ImageResponse(
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5c842',
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{
        width: '76%',
        height: '76%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `${Math.round(size * 0.035)}px solid #2c1a0e`,
        borderRadius: size * 0.2,
        color: '#2c1a0e',
        fontSize: size * 0.5,
        WebkitTextStroke: `${Math.round(size * 0.04)}px #2c1a0e`,
      }}>S</div>
    </div>,
    { width: size, height: size },
  );
}
