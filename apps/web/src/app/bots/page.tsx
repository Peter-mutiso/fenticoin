import { AppShell } from '@/components/layout/AppShell';
import { BotsBrowser } from '@/components/bots/BotsBrowser';

export default function BotsPage() {
  return (
    <AppShell requireAuth>
      <div className="pb-8">
        <BotsBrowser />
      </div>
    </AppShell>
  );
}
