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
  const presetKey = searchParams.get('preset');
  const router = useRouter();
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({ queryKey: ['bots', 'catalog'], queryFn: getBotCatalog });
  const entry = catalogQuery.data?.items.find((item) => item.key === strategyKey);
  // A "Recommended Bots" preset only ever pre-fills this form — see
  // `bot-presets.ts` on the API. The bot that gets created still goes
  // through the exact same `createBot` call, validated the same way,
  // as one built from scratch.
  const preset = presetKey ? catalogQuery.data?.presets.find((item) => item.key === presetKey && item.strategyKey === strategyKey) : undefined;

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
      initialName={preset?.name ?? ''}
      initialConfig={preset?.defaultConfig ?? {}}
      initialExecutionIntervalSeconds={preset?.executionIntervalSeconds}
      submitLabel="Create bot"
      submitting={createMutation.isPending}
      error={createMutation.error ? describeApiError(createMutation.error).title : null}
      onSubmit={(value) =>
        createMutation.mutate({ name: value.name, strategyKey: entry.key, config: value.config, executionIntervalSeconds: value.executionIntervalSeconds })
      }
    />
  );
}
