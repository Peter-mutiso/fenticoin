export type NotificationKind = 'bet_settled' | 'deposit_status' | 'withdrawal_status';
export type NotificationTone = 'success' | 'error' | 'info';

export interface AppNotification {
  /** Deterministic — `${kind}:${entityId}:${toStatus}` — so re-deriving the same real-world transition twice (a remount, a second tab) is a no-op, not a duplicate. */
  id: string;
  kind: NotificationKind;
  entityId: string;
  title: string;
  description: string;
  tone: NotificationTone;
  createdAt: string;
  read: boolean;
  href: string;
}
