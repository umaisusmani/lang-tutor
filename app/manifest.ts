import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Starvogel',
    short_name: 'Starvogel',
    description: 'Practice German conversation with an AI tutor that explains your mistakes.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7efe4',
    theme_color: '#f7efe4',
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png' },
      { src: '/icon1', sizes: '512x512', type: 'image/png' },
      { src: '/icon1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
