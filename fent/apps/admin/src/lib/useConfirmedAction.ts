import { useCallback, useState } from 'react';

import type { ConfirmDialogProps } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { describeApiError } from './api-errors';

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  reasonRequired?: boolean;
  requireTypedConfirmation?: string;
  onConfirm: (reason?: string) => Promise<unknown>;
  /** Toast title shown after a successful confirm. Omit to skip the toast. */
  successMessage?: string;
}

/**
 * Drives the single shared `ConfirmDialog` used for every destructive/
 * high-impact admin action. Usage:
 *
 *   const { confirm, dialogProps } = useConfirmedAction();
 *   confirm({ title: 'Suspend account?', description: '...', reasonRequired: true,
 *             onConfirm: (reason) => setUserStatus(id, 'suspended', reason),
 *             successMessage: 'Account suspended' });
 *   ...
 *   <ConfirmDialog {...dialogProps} />
 */
export function useConfirmedAction() {
  const { show } = useToast();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setError(null);
    setOptions(next);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setOptions(null);
    setError(null);
  }, [submitting]);

  const handleConfirm = useCallback(
    async (reason?: string) => {
      if (!options) return;
      setSubmitting(true);
      setError(null);
      try {
        await options.onConfirm(reason);
        setOptions(null);
        if (options.successMessage) {
          show({ tone: 'success', title: options.successMessage });
        }
      } catch (thrown) {
        setError(describeApiError(thrown).title);
      } finally {
        setSubmitting(false);
      }
    },
    [options, show],
  );

  const dialogProps: ConfirmDialogProps = {
    open: options !== null,
    title: options?.title ?? '',
    description: options?.description ?? '',
    confirmLabel: options?.confirmLabel ?? 'Confirm',
    destructive: options?.destructive,
    reasonRequired: options?.reasonRequired,
    requireTypedConfirmation: options?.requireTypedConfirmation,
    submitting,
    error,
    onConfirm: handleConfirm,
    onClose: handleClose,
  };

  return { confirm, dialogProps };
}
