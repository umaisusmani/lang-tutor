import { pwaIcon } from '@/app/pwa-icon';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return pwaIcon(size.width);
}
