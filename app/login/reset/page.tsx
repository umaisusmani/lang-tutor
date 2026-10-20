import { Brand } from '@/app/components/brand';
import { getCurrentUserId } from '@/lib/services/profile.service';
import { PasswordResetForm } from './password-reset-form';

export default async function PasswordResetPage({ searchParams }: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const params = await searchParams;
  const updating = params.mode === 'update';
  const userId = updating ? await getCurrentUserId() : null;
  return (
    <div className="bg-paper text-ink flex min-h-dvh flex-col items-center px-[18px] pb-6">
      <header className="w-full max-w-[1080px] pt-5"><Brand /></header>
      <main className="flex w-full max-w-[420px] flex-1 flex-col justify-center gap-5 py-12">
        <PasswordResetForm updating={updating && !!userId}
          invalidLink={params.error === 'recovery_failed' || (updating && !userId)} />
      </main>
    </div>
  );
}
