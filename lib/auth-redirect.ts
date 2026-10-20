/** Keep auth callbacks on this site, including recovery's query string. */
export function authRedirectPath(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  return value;
}
