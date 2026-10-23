export type TranslationDirection = 'de-en' | 'en-de';

export function isTranslationDirection(value: unknown): value is TranslationDirection {
  return value === 'de-en' || value === 'en-de';
}

export function parseTranslationInput(value: unknown): { text: string; direction: TranslationDirection } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const text = typeof record.text === 'string' ? record.text.trim() : '';
  if (!text || text.length > 200 || !isTranslationDirection(record.direction)) return null;
  return { text, direction: record.direction };
}

export function isDictionaryWord(text: string): boolean {
  return text.length <= 50 && /^[\p{L}\p{M}]+$/u.test(text);
}

export class TranslatorError extends Error {
  constructor(public readonly kind: 'unavailable' | 'limit') {
    super(kind);
  }
}

export function hasTranslatorEnv(): boolean {
  return Boolean(process.env.AZURE_TRANSLATOR_KEY && process.env.AZURE_TRANSLATOR_REGION);
}

type AzureDictionaryResult = { translations?: Array<{ displayTarget?: string }> };
type AzureTextResult = { translations?: Array<{ text?: string }> };

export async function translateWithAzure(
  text: string,
  direction: TranslationDirection,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  if (!key || !region) throw new TranslatorError('unavailable');

  const [from, to] = direction.split('-');
  const headers = {
    'Ocp-Apim-Subscription-Key': key,
    'Ocp-Apim-Subscription-Region': region,
    'Content-Type': 'application/json; charset=UTF-8',
  };

  async function request(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`https://api.cognitive.microsofttranslator.com/${path}?api-version=3.0&from=${from}&to=${to}`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ Text: text }]),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new TranslatorError('unavailable');
    }
    if (!response.ok) {
      // Azure sends 403001 after the free quota is exhausted. Never forward its
      // raw error body, which may include account details.
      const body = await response.json().catch(() => null);
      const code = body && typeof body === 'object' && 'error' in body
        ? (body.error as { code?: number | string } | null)?.code : undefined;
      if (response.status === 403 && String(code) === '403001') throw new TranslatorError('limit');
      console.error('[translator] Azure request failed:', response.status);
      throw new TranslatorError('unavailable');
    }
    try {
      return await response.json();
    } catch {
      throw new TranslatorError('unavailable');
    }
  }

  if (isDictionaryWord(text)) {
    const result = await request('dictionary/lookup') as AzureDictionaryResult[];
    const word = result?.[0]?.translations?.[0]?.displayTarget?.trim();
    if (word) return word;
  }

  const result = await request('translate') as AzureTextResult[];
  const translation = result?.[0]?.translations?.[0]?.text?.trim();
  if (!translation) throw new TranslatorError('unavailable');
  return translation;
}
