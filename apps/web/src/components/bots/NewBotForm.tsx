'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';

import { createBot, getBotCatalog } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { BotConfigForm } from './BotConfigForm';

export function NewBotForm() {
  const searchParams = useSearchParams();
  const strategyKey = searchParams.get('strategy') ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({ queryKey: ['bots', 'catalog'], queryFn: getBotCatalog });
  const entry = catalogQuery.data?.items.find((item) => item.key === strategyKey);

  const createMutation = useMutation({
    mutationFn: createBot,
    onSuccess: async (bot) => {
      await queryClient.invalidateQueries({ queryKey: ['bots'] });
      router.push(`/bots/${bot.id}`);
    },
  });

  if (catalogQuery.isPending) {
    return <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />;
  }

  if (catalogQuery.error) {
    return <Notice text={describeApiError(catalogQuery.error).title} />;
  }

  if (!entry || entry.comingSoon) {
    return <Notice text="This strategy isn't available to configure." />;
  }

  return (
    <BotConfigForm
      entry={entry}
      submitLabel="Create bot"
      submitting={createMutation.isPending}
      error={createMutation.error ? describeApiError(createMutation.error).title : null}
      onSubmit={(value) => createMutation.mutate({ name: value.name, strategyKey: entry.key, config: value.config })}
    />
  );
}
