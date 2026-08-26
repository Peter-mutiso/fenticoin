'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { getBot, getBotCatalog, updateBot } from '@/lib/api-client';
import { describeApiError } from '@/lib/api-errors';
import { Notice } from '@/components/ui/Notice';
import { BotConfigForm } from './BotConfigForm';

export function EditBotForm({ botId }: { botId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const botQuery = useQuery({ queryKey: ['bot', botId], queryFn: () => getBot(botId) });
  const catalogQuery = useQuery({ queryKey: ['bots', 'catalog'], queryFn: getBotCatalog });
  const entry = catalogQuery.data?.items.find((item) => item.key === botQuery.data?.strategyKey);

  const updateMutation = useMutation({
    mutationFn: (value: { name: string; config: Record<string, unknown> }) => updateBot(botId, value),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bots'] }),
        queryClient.invalidateQueries({ queryKey: ['bot', botId] }),
      ]);
      router.push(`/bots/${botId}`);
    },
  });

  if (botQuery.isPending || catalogQuery.isPending) {
    return <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />;
  }

  if (botQuery.error) return <Notice text={describeApiError(botQuery.error).title} />;
  if (catalogQuery.error) return <Notice text={describeApiError(catalogQuery.error).title} />;

  const bot = botQuery.data!;
  if (bot.status === 'active') {
    return <Notice text="Deactivate this bot before changing its configuration." />;
  }
  if (!entry) {
    return <Notice text="This bot's strategy is no longer available to configure." />;
  }

  return (
    <BotConfigForm
      entry={entry}
      initialName={bot.name}
      initialConfig={bot.config}
      submitLabel="Save changes"
      submitting={updateMutation.isPending}
      error={updateMutation.error ? describeApiError(updateMutation.error).title : null}
      onSubmit={(value) => updateMutation.mutate(value)}
    />
  );
}
