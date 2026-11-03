import { pwaIcon } from '@/app/pwa-icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return pwaIcon(size.width);
}
