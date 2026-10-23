import { getCurrentUserId } from '@/lib/services/profile.service';
import { consumeTranslation } from '@/lib/services/translation.service';
import { hasTranslatorEnv, parseTranslationInput, translateWithAzure, TranslatorError } from '@/lib/translator';

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 3000) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const input = parseTranslationInput(body);
  if (!input) {
    return Response.json({ error: 'Enter up to 200 characters and select a direction.' }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: 'Sign in to use Translate.' }, { status: 401 });
  }
  if (!hasTranslatorEnv()) {
    return Response.json({ error: 'Translation is not configured yet.' }, { status: 503 });
  }

  const usage = await consumeTranslation(userId);
  if (!usage.allowed) {
    const error = usage.reason === 'user'
      ? 'You have used your 50 translations for today. Try again tomorrow.'
      : usage.reason === 'global'
        ? 'Translations are full for today. Try again tomorrow.'
        : 'Could not check the translation allowance. Please try again.';
    return Response.json({ error, remaining: usage.reason === 'user' ? 0 : undefined }, {
      status: usage.reason === 'unavailable' ? 503 : 429,
    });
  }

  try {
    const translation = await translateWithAzure(input.text, input.direction);
    return Response.json({ translation, remaining: usage.remaining }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const message = error instanceof TranslatorError && error.kind === 'limit'
      ? 'The translation service has reached its free limit for this month.'
      : 'Translation is unavailable right now. Please try again later.';
    return Response.json({ error: message, remaining: usage.remaining }, { status: 503 });
  }
}
