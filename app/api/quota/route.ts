import { getCurrentUserId } from '@/lib/services/profile.service';
import { getQuotaStatus } from '@/lib/services/session.service';

export async function GET() {
  const quota = await getQuotaStatus(await getCurrentUserId());
  return Response.json(quota, { headers: { 'Cache-Control': 'private, no-store' } });
}
