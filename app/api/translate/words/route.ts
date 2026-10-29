import { glossText } from '@/lib/gloss';
import { getCurrentUserId } from '@/lib/services/profile.service';
import { consumeTranslation } from '@/lib/services/translation.service';
import { groupGlossIntoUnits } from '@/lib/word-units';

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
  const text = body && typeof body === 'object' && 'text' in body && typeof body.text === 'string'
    ? body.text.trim() : '';
  if (!text || text.length > 200) {
    return Response.json({ error: 'Enter up to 200 characters.' }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: 'Sign in to use Translate.' }, { status: 401 });
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
    const gloss = await glossText(text, { userId });
    return Response.json({ units: groupGlossIntoUnits(gloss.words), remaining: usage.remaining }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return Response.json({ error: 'Could not break that down right now. Please try again.', remaining: usage.remaining }, {
      status: 503,
    });
  }
}
