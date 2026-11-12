import type { MetadataRoute } from 'next';
import { activeLanguage } from '@/lib/languages';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: activeLanguage.appName,
    short_name: activeLanguage.appName,
    description: activeLanguage.appDescription,
    start_url: '/',
    display: 'standalone',
    background_color: activeLanguage.backgroundColor,
    theme_color: activeLanguage.themeColor,
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png' },
      { src: '/icon1', sizes: '512x512', type: 'image/png' },
      { src: '/icon1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
